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
// TODO(jaked) could separate inline / block code for better type safety
const parsedCode = new WeakMap<PMAST.Node, Try<ESTree.Node>>();

function findImports(
  nodes: PMAST.Node[]
) {
  const imports = Immutable.Set<string>().asMutable();
  // TODO(jaked)
  return imports.asImmutable();
}

export function synthPm(
  moduleName: string,
  node: PMAST.Node,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Typecheck.Env,
  exportTypes: { [s: string]: Type },
  annots?: AstAnnotations,
): Typecheck.Env {
  if (PMAST.isCode(node)) {
    const code = parsedCode.get(node);
    if (!code) bug('expected parsed code');
    code.forEach(code => {
      (code as ESTree.Program).body.forEach(node => {
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
    })
  } else if (PMAST.isInlineCode(node)) {
    const code = parsedCode.get(node);
    if (!code) bug('expected parsed code');
    code.forEach(code =>
      Typecheck.check(code as ESTree.Expression, env, Type.reactNodeType, annots)
    );
  } else if (PMAST.isElement(node)) {
    node.children.forEach(child =>
      env = synthPm(moduleName, child, moduleEnv, env, exportTypes, annots)
    );
  }

  return env;
}

// TODO(jaked)
// seems like we should be able to avoid traversing the whole node tree
// similarly to how slate-react avoids it
// i.e. track old tree and traverse only changed parts
const parseCode = (node: PMAST.Node) => {
  if (parsedCode.has(node)) return;

  if (PMAST.isCode(node) || PMAST.isInlineCode(node)) {
    // TODO(jaked) enforce tree constraints in editor
    if (!(node.children.length === 1)) bug('expected 1 child');
    const child = node.children[0];
    if (!(PMAST.isText(child))) bug('expected text');
    if (PMAST.isCode(node)) {
      const ast = Try.apply(() => Parse.parseProgram(child.text));
      parsedCode.set(node, ast);
    } else {
      const ast = Try.apply(() => Parse.parseExpression(child.text));
      parsedCode.set(node, ast);
    }
  } else if (PMAST.isElement(node)) {
    node.children.map(child => parseCode(child));
  }
}

export function renderNodes(
  nodes: PMAST.Node[],
  parsedCode: WeakMap<PMAST.Node, Try<ESTree.Node>>,
  annots: AstAnnotations,
  moduleName: string,
  moduleEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Render.Env,
  exportValue: { [s: string]: Signal<any> }
): { env: Render.Env, rendered: Signal<React.ReactNode[]> } {
  const rendered: Signal<React.ReactNode>[] = [];
  for (const node of nodes) {
    const render =
      renderNode(node, parsedCode, annots, moduleName, moduleEnv, env, exportValue);
    env = render.env;
    rendered.push(render.rendered);
  }
  return { env, rendered: Signal.join(...rendered) };
}

export function renderNode(
  node: PMAST.Node,
  parsedCode: WeakMap<PMAST.Node, Try<ESTree.Node>>,
  annots: AstAnnotations,
  moduleName: string,
  moduleEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Render.Env,
  exportValue: { [s: string]: Signal<any> }
): { env: Render.Env, rendered: Signal<React.ReactNode> } {
  const key = findKey(node);
  if ('text' in node) {
    let text: any = node.text;
    if (node.bold)      text = <strong>{text}</strong>;
    if (node.italic)    text = <em>{text}</em>;
    if (node.underline) text = <u>{text}</u>;
    if (node.code)      text = <code>{text}</code>;
    return {
      env,
      rendered: Signal.ok(<span style={{whiteSpace: 'pre-line'}} key={key}>{text}</span>)
    };
  } else {
    if (node.type === 'code') {
      const code = parsedCode.get(node) ?? bug(`expected code`);
      if (code.type === 'ok') {
        const rendered: Signal<React.ReactNode>[] = [];
        for (const node of (code.ok as ESTree.Program).body) {
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

            case 'ExpressionStatement':
              rendered.push(Render.evaluateExpressionSignal(node.expression, annots, env));
              break;
          }
        }
        return { env, rendered: Signal.join(...rendered) }
      }
      return { env, rendered: Signal.ok(null) };

    } else if (node.type === 'inlineCode') {
      const code = parsedCode.get(node) ?? bug(`expected code`);
      if (code.type === 'ok') {
        const type = annots.get(code.ok) ?? bug(`expected type`);
        if (type.kind !== 'Error') {
          return {
            env,
            rendered: Render.evaluateExpressionSignal(code.ok as ESTree.Expression, annots, env)
          }
        }
      }
      return { env, rendered: Signal.ok(null) };

    } else {
      const children = renderNodes(node.children, parsedCode, annots, moduleName, moduleEnv, env, exportValue);
      if (node.type === 'a') {
        return {
          env: children.env,
          rendered: children.rendered.map(children =>
            React.createElement(node.type, { key, href: node.href }, ...children)
          )
        };
      } else {
        return {
          env: children.env,
          rendered: children.rendered.map(children =>
            React.createElement(node.type, { key }, ...children)
          )
        };
      }
    }
  }
}

export default function compileFilePm(
  file: Content,
  compiledFiles: Signal<Immutable.Map<string, CompiledFile>>,
  compiledNotes: Signal<CompiledNotes>,
  setSelected: (note: string) => void,
): CompiledFile {
  const moduleName = Name.nameOfPath(file.path);

  const nodes = file.content as Signal<PMAST.Node[]>;
  const ast = nodes.map(nodes => {
    nodes.forEach(parseCode);
    return { nodes, parsedCode }
  });

  // depend on ast so that parsedCode is filled in
  const imports = ast.map(({ nodes }) => findImports(nodes));

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

  const typecheck = Signal.join(
    ast,
    moduleTypeEnv
  ).map(([{ nodes }, moduleTypeEnv]) => {
    // TODO(jaked) pass in these envs from above?
    let typeEnv = Render.initTypeEnv;

    const exportTypes: { [s: string]: Type.Type } = {};
    const astAnnotations = new Map<unknown, Type>();
    nodes.forEach(node =>
      typeEnv = synthPm(moduleName, node, moduleTypeEnv, typeEnv, exportTypes, astAnnotations)
    );
    const problems = [...astAnnotations.values()].some(t => t.kind === 'Error');
    const exportType = Type.module(exportTypes);
    return { exportType, astAnnotations, problems }
  });

  const render = Signal.join(
    nodes,
    ast,
    typecheck,
    moduleValueEnv,
  ).map(([nodes, { parsedCode }, typecheck, moduleValueEnv]) => {
    // TODO(jaked) pass in these envs from above?
    let valueEnv = Render.initValueEnv(setSelected);

    const exportValue: { [s: string]: Signal<any> } = {};
    const { rendered } = renderNodes(
      nodes,
      parsedCode,
      typecheck.astAnnotations,
      moduleName,
      moduleValueEnv,
      valueEnv,
      exportValue,
    );

    return { exportValue, rendered };
   });

  return {
    ast,
    exportType: typecheck.map(({ exportType }) => exportType),
    astAnnotations: typecheck.map(({ astAnnotations }) => astAnnotations),
    exportValue: Signal.ok({ }),
    rendered: render.flatMap(({ rendered }) => rendered),
    problems: Signal.ok(false),
  };
}
