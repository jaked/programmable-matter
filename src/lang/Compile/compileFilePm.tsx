import * as Immutable from 'immutable';
import React from 'react';

import { bug } from '../../util/bug';
import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import { AstAnnotations, Content, CompiledFile, CompiledNote, CompiledNotes } from '../../data';
import * as PMAST from '../../PMAST';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import * as Render from '../Render';
import Type from '../Type';
import Typecheck from '../Typecheck';

let nextKey = 0;
const KEYS = new WeakMap<PMAST.Node, string>();
function findKey(node: PMAST.Node): string {
  let key = KEYS.get(node);
  if (key === undefined) {
    key = `${nextKey++}`;
    KEYS.set(node, key);
  }
  return key;
}

// Slate guarantees fresh objects for changed nodes
// so it's safe to keep a global weak map (I think?)
const parsedCode = new WeakMap<PMAST.Code, Try<ESTree.Program>>();
const parsedInlineCode = new WeakMap<PMAST.InlineCode, Try<ESTree.Expression>>();

export function synthCode(
  moduleName: string,
  node: PMAST.Code,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Typecheck.Env,
  exportTypes: { [s: string]: Type },
  annots?: AstAnnotations,
): Typecheck.Env {
  const code = parsedCode.get(node) ?? bug('expected parsed code');
  code.forEach(code => {
    code.body.forEach(node => {
      switch (node.type) {
        case 'ExportDefaultDeclaration':
          env = Typecheck.extendEnvWithDefaultExport(node, exportTypes, env, annots);
          break;
        case 'ExportNamedDeclaration':
          env = Typecheck.extendEnvWithNamedExport(node, exportTypes, env, annots);
          break;
        case 'ImportDeclaration':
          env = Typecheck.extendEnvWithImport(moduleName, node, moduleEnv, env, annots);
          break;
        case 'VariableDeclaration':
          // TODO(jaked) ???
          break;
        case 'ExpressionStatement':
          Typecheck.check(node.expression, env, Type.reactNodeType, annots);
          break;
      }
    });
  });
  return env;
}

export function synthInlineCode(
  node: PMAST.InlineCode,
  env: Typecheck.Env,
  annots?: AstAnnotations,
) {
  const code = parsedInlineCode.get(node) ?? bug('expected parsed code');
  code.forEach(code =>
    Typecheck.check(code, env, Type.reactNodeType, annots)
  );
}

export function compileCode(
  node: PMAST.Code,
  annots: AstAnnotations,
  moduleName: string,
  moduleEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Render.Env,
  exportValue: { [s: string]: Signal<any> }
): Render.Env {
  const code = parsedCode.get(node) ?? bug(`expected parsed code`);
  code.forEach(code => {
    for (const node of code.body) {
      switch (node.type) {
        case 'ImportDeclaration':
          env = Render.extendEnvWithImport(moduleName, node, annots, moduleEnv, env);
          break;

        case 'ExportNamedDeclaration':
          env = Render.extendEnvWithNamedExport(node, annots, env, exportValue);
          break;

        case 'ExportDefaultDeclaration':
          env = Render.extendEnvWithDefaultExport(node, annots, env, exportValue);
          break;

        case 'VariableDeclaration':
          break; // TODO(jaked) ???
      }
    }
  });
  return env;
}

// memo table of rendered static nodes
// code nodes or nodes containing code nodes are not memoized
// since their rendering may depend on typechecking etc.
const renderedNode = new WeakMap<PMAST.Node, Signal<React.ReactNode>>();

export function renderNode(
  node: PMAST.Node,
  annots: AstAnnotations,
  env: Render.Env,
): Signal<React.ReactNode> {
  const rendered = renderedNode.get(node);
  if (rendered) return rendered;
  const key = findKey(node);
  if ('text' in node) {
    let text: any = node.text;
    if (node.bold)          text = <strong>{text}</strong>;
    if (node.italic)        text = <em>{text}</em>;
    if (node.underline)     text = <u>{text}</u>;
    if (node.strikethrough) text = <del>{text}</del>;
    if (node.code)          text = <code>{text}</code>;
    const rendered = Signal.ok(<span style={{whiteSpace: 'pre-line'}} key={key}>{text}</span>);
    renderedNode.set(node, rendered);
    return rendered;
  } else {
    if (node.type === 'code') {
      const code = parsedCode.get(node) ?? bug(`expected parsed code`);
      if (code.type !== 'ok') return Signal.ok(null);
      const rendered: Signal<React.ReactNode>[] = [];
      for (const node of code.ok.body) {
        switch (node.type) {
          case 'ExpressionStatement':
            rendered.push(Render.evaluateExpressionSignal(node.expression, annots, env));
            break;
        }
      }
      return Signal.join(...rendered);

    } else if (node.type === 'inlineCode') {
      const code = parsedInlineCode.get(node) ?? bug(`expected parsed code`);
      if (code.type !== 'ok') return Signal.ok(null);
      const type = annots.get(code.ok) ?? bug(`expected type`);
      if (type.kind === 'Error') return Signal.ok(null);
      return Render.evaluateExpressionSignal(code.ok as ESTree.Expression, annots, env);

    } else {
      const children = node.children.map(child => renderNode(child, annots,env));
      let rendered;
      if (node.type === 'a') {
        rendered = Signal.join(...children).map(children =>
          React.createElement(node.type, { key, href: node.href }, ...children)
        );
      } else {
        rendered = Signal.join(...children).map(children =>
          React.createElement(node.type, { key }, ...children)
        );
      }
      if (node.children.every(node => renderedNode.has(node)))
        renderedNode.set(node, rendered);
      return rendered;
    }
  }
}

export default function compileFilePm(
  file: Content,
  compiledFiles: Signal<Immutable.Map<string, CompiledFile>> = Signal.ok(Immutable.Map()),
  compiledNotes: Signal<CompiledNotes> = Signal.ok(Immutable.Map()),
  setSelected: (note: string) => void = (note: string) => { },
): CompiledFile {
  const moduleName = Name.nameOfPath(file.path);

  const nodes = file.content as Signal<PMAST.Node[]>;

  // TODO(jaked)
  // we want just the bindings and imports here, but this also includes ExpressionStatements
  const codeNodes = nodes.map(nodes =>
    Immutable.List<PMAST.Code>().withMutations(codeNodes => {
      function parseCode(node: PMAST.Node) {
        if (PMAST.isCode(node)) {
          codeNodes.push(node);
          if (!parsedCode.has(node)) {
            // TODO(jaked) enforce tree constraints in editor
            if (!(node.children.length === 1)) bug('expected 1 child');
            const child = node.children[0];
            if (!(PMAST.isText(child))) bug('expected text');
            const ast = Try.apply(() => Parse.parseProgram(child.text));
            parsedCode.set(node, ast);
          }
        } else if (PMAST.isElement(node)) {
          node.children.forEach(parseCode);
        }
      }
      nodes.forEach(parseCode);
    })
  );

  const inlineCodeNodes = nodes.map(nodes =>
    Immutable.List<PMAST.InlineCode>().withMutations(inlineCodeNodes => {
      function parseInlineCode(node: PMAST.Node) {
        if (PMAST.isInlineCode(node)) {
          inlineCodeNodes.push(node);
          if (!parsedInlineCode.has(node)) {
              // TODO(jaked) enforce tree constraints in editor
            if (!(node.children.length === 1)) bug('expected 1 child');
            const child = node.children[0];
            if (!(PMAST.isText(child))) bug('expected text');
            const ast = Try.apply(() => Parse.parseExpression(child.text));
            parsedInlineCode.set(node, ast);
          }
        } else if (PMAST.isElement(node)) {
          node.children.forEach(parseInlineCode);
        }
      }
      nodes.forEach(parseInlineCode);
    })
  );

  const imports = codeNodes.map(codeNodes =>
    Immutable.List<string>().withMutations(imports => {
      codeNodes.forEach(node => {
        const code = (parsedCode.get(node)) ?? bug(`expected parsed code`);
        code.forEach(code =>
          (code as ESTree.Program).body.forEach(node => {
            switch (node.type) {
              case 'ImportDeclaration':
                imports.push(node.source.value);
                break;
            }
          })
        );
      });
    })
  );

  // TODO(jaked) push note errors into envs so they're surfaced in editor?
  const noteEnv =
    Signal.join(imports, compiledNotes).map(([imports, compiledNotes]) =>
      Immutable.Map<string, CompiledNote>().withMutations(noteEnv => {
        imports.forEach(name => {
          // TODO(jaked)
          // we do this resolution here, in Synth, and in Render
          // could rewrite or annotate the AST to do it just once
          const resolvedName = Name.rewriteResolve(compiledNotes, moduleName, name);
          if (resolvedName) {
            const note = compiledNotes.get(resolvedName) ?? bug(`expected module '${resolvedName}'`);
            noteEnv.set(resolvedName, note);
          }
        });
        return noteEnv
      })
    );
  const moduleTypeEnv = Signal.joinImmutableMap(
    noteEnv.map(noteEnv => noteEnv.map(note => note.exportType))
  );
  const moduleValueEnv =
    noteEnv.map(noteEnv => noteEnv.map(note => note.exportValue));

  const typecheckCode = Signal.join(
    codeNodes,
    moduleTypeEnv
  ).map(([codeNodes, moduleTypeEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let env = Render.initTypeEnv;

    const exportTypes: { [s: string]: Type.Type } = {};
    const astAnnotations = new Map<unknown, Type>();
    codeNodes.forEach(node =>
      env = synthCode(moduleName, node, moduleTypeEnv, env, exportTypes, astAnnotations)
    );
    const exportType = Type.module(exportTypes);
    return { astAnnotations, env, exportType }
  });

  // TODO(jaked)
  // re-typecheck only nodes that have changed since previous render
  // or when env changes
  const typecheckInlineCode = Signal.join(
    typecheckCode,
    inlineCodeNodes,
  ).map(([{ astAnnotations, env }, inlineCodeNodes]) => {
    inlineCodeNodes.forEach(node =>
      synthInlineCode(node, env, astAnnotations)
    );
    const problems = [...astAnnotations.values()].some(t => t.kind === 'Error');
    return { astAnnotations, problems }
  });

  const ast = Signal.join(codeNodes, inlineCodeNodes).map(_ => parsedCode);

  const compile = Signal.join(
    codeNodes,
    typecheckCode,
    moduleValueEnv,
  ).map(([codeNodes, { astAnnotations }, moduleValueEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let env = Render.initValueEnv(setSelected);

    const exportValue: { [s: string]: Signal<any> } = {};
    codeNodes.forEach(node =>
      env = compileCode(node, astAnnotations, moduleName, moduleValueEnv, env, exportValue)
    );
    return { env, exportValue };
   });

  // TODO(jaked)
  // re-render only nodes that have changed since previous render
  // or when env changes
  const rendered = Signal.join(
    nodes,
    ast, // dependency to ensure parsedCode is up to date
    compile,
    typecheckInlineCode,
  ).flatMap(([nodes, _ast, { env }, { astAnnotations }]) =>
    Signal.join(...nodes.map(node => renderNode(node, astAnnotations, env)))
  );

  return {
    ast,
    exportType: typecheckCode.map(({ exportType }) => exportType),
    // TODO(jaked)
    // because astAnnotations is reused from typecheckCode and mutated
    // this signal won't update when only inlineCode annotations have changed
    // so decorations won't be updated
    // it happens to work anyway, but astAnnotations should be immutable
    astAnnotations: typecheckInlineCode.map(({ astAnnotations }) => astAnnotations),
    problems: typecheckInlineCode.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compile.map(({ exportValue }) => exportValue),
    rendered,
  };
}
