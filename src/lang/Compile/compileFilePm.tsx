import Path from 'path';
import * as Immutable from 'immutable';
import React from 'react';

import { bug } from '../../util/bug';
import * as Name from '../../util/Name';
import * as MapFuncs from '../../util/MapFuncs';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import { AstAnnotations, Content, CompiledFile, CompiledNote, CompiledNotes } from '../../data';
import * as PMAST from '../../PMAST';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import * as Evaluate from '../Evaluate';
import * as Render from '../Render';
import Type from '../Type';
import Typecheck from '../Typecheck';

import makeLink from '../../components/makeLink';
import metaForPath from './metaForPath';

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
const parsedCode = new WeakMap<PMAST.Node, Try<ESTree.Node>>();

export function synthCode(
  moduleName: string,
  node: PMAST.Code,
  moduleEnv: Map<string, Type.ModuleType>,
  env: Typecheck.Env,
  exportTypes: { [s: string]: Type },
  annots?: AstAnnotations,
): Typecheck.Env {
  const code = parsedCode.get(node) ?? bug('expected parsed code');
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
  });
  return env;
}

export function synthInlineCode(
  node: PMAST.InlineCode,
  env: Typecheck.Env,
  annots?: AstAnnotations,
) {
  const code = parsedCode.get(node) ?? bug('expected parsed code');
  code.forEach(code =>
    Typecheck.check(code as ESTree.Expression, env, Type.reactNodeType, annots)
  );
}

function evaluateExpressionSignal(
  ast: ESTree.Expression,
  annots: AstAnnotations,
  env: Render.Env
): Signal<any> {
  const idents = ESTree.freeIdentifiers(ast);
  const signals = idents.map(id => {
    const signal = env.get(id);
    if (signal) return signal;
    else return Signal.ok(Error(`unbound identifier ${id}`));
  });
  return Signal.join(...signals).map(values => {
    const env = Immutable.Map(idents.map((id, i) => [id, values[i]]));
    return Evaluate.evaluateExpression(ast, annots, env);
  });
}

function extendEnvWithImport(
  mdxName: string,
  decl: ESTree.ImportDeclaration,
  annots: AstAnnotations,
  moduleEnv: Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Render.Env,
): Render.Env {
  // TODO(jaked) finding errors in the AST is delicate.
  // need to separate error semantics from error highlighting.
  const type = annots.get(decl.source);
  if (type && type.kind === 'Error') {
    decl.specifiers.forEach(spec => {
      env = env.set(spec.local.name, Signal.ok(type.err));
    });
  } else {
    const moduleName = Name.rewriteResolve(moduleEnv, mdxName, decl.source.value) || bug(`expected module '${decl.source.value}'`);
    const module = moduleEnv.get(moduleName) ?? bug(`expected module '${moduleName}'`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          env = env.set(spec.local.name, module.flatMap(module => Signal.joinObject(module)));
          break;
        }

        case 'ImportDefaultSpecifier': {
          const type = annots.get(spec.local);
          if (type && type.kind === 'Error') {
            env = env.set(spec.local.name, Signal.ok(type.err))
          } else {
            const defaultField = module.flatMap(module => {
              if ('default' in module) return module.default;
              else bug(`expected default export on '${decl.source.value}'`)
            });
            env = env.set(spec.local.name, defaultField);
          }
        }
        break;

        case 'ImportSpecifier': {
          const type = annots.get(spec.imported);
          if (type && type.kind === 'Error') {
            env = env.set(spec.local.name, Signal.ok(type.err))
          } else {
            const importedField = module.flatMap(module => {
              if (spec.imported.name in module) return module[spec.imported.name];
              else bug(`expected exported member '${spec.imported.name}' on '${decl.source.value}'`);
            });
            env = env.set(spec.local.name, importedField);
          }
        }
        break;
      }
    });
  }
  return env;
}

function extendEnvWithNamedExport(
  decl: ESTree.ExportNamedDeclaration,
  annots: AstAnnotations,
  env: Render.Env,
  exportValue: { [s: string]: Signal<any> }
): Render.Env {
  const declaration = decl.declaration;
  switch (declaration.kind) {
    case 'const': {
      declaration.declarations.forEach(declarator => {
        let name = declarator.id.name;
        let value = evaluateExpressionSignal(declarator.init, annots, env);
        exportValue[name] = value;
        env = env.set(name, value);
      });
    }
    break;

    default: throw new Error('unexpected AST ' + declaration.kind);
  }
  return env;
}

function extendEnvWithDefaultExport(
  decl: ESTree.ExportDefaultDeclaration,
  annots: AstAnnotations,
  env: Render.Env,
  exportValue: { [s: string]: Signal<any> }
): Render.Env {
  const value = evaluateExpressionSignal(decl.declaration, annots, env);
  exportValue['default'] = value;
  return env;
}

export function compileCode(
  node: PMAST.Code,
  annots: AstAnnotations,
  moduleName: string,
  moduleEnv: Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Render.Env,
  exportValue: { [s: string]: Signal<any> }
): Render.Env {
  const code = parsedCode.get(node) ?? bug(`expected parsed code`);
  code.forEach(code => {
    for (const node of (code as ESTree.Program).body) {
      switch (node.type) {
        case 'ImportDeclaration':
          env = extendEnvWithImport(moduleName, node, annots, moduleEnv, env);
          break;

        case 'ExportNamedDeclaration':
          env = extendEnvWithNamedExport(node, annots, env, exportValue);
          break;

        case 'ExportDefaultDeclaration':
          env = extendEnvWithDefaultExport(node, annots, env, exportValue);
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
  Link: React.FunctionComponent<{ href: string }> = () => null,
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
      for (const node of (code.ok as ESTree.Program).body) {
        switch (node.type) {
          case 'ExpressionStatement':
            rendered.push(evaluateExpressionSignal(node.expression, annots, env));
            break;
        }
      }
      return Signal.join(...rendered);

    } else if (node.type === 'inlineCode') {
      const code = parsedCode.get(node) ?? bug(`expected parsed code`);
      if (code.type !== 'ok') return Signal.ok(null);
      const type = annots.get(code.ok) ?? bug(`expected type`);
      if (type.kind === 'Error') return Signal.ok(null);
      return evaluateExpressionSignal(code.ok as ESTree.Expression, annots, env);

    } else {
      const children = node.children.map(child => renderNode(child, annots, env, Link));
      let rendered;
      if (node.type === 'a') {
        rendered = Signal.join(...children).map(children =>
          React.createElement(Link, { key, href: node.href }, ...children)
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
  compiledFiles: Signal<Map<string, CompiledFile>> = Signal.ok(new Map()),
  compiledNotes: Signal<CompiledNotes> = Signal.ok(new Map()),
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
          if (!parsedCode.has(node)) {
              // TODO(jaked) enforce tree constraints in editor
            if (!(node.children.length === 1)) bug('expected 1 child');
            const child = node.children[0];
            if (!(PMAST.isText(child))) bug('expected text');
            const ast = Try.apply(() => Parse.parseExpression(child.text));
            parsedCode.set(node, ast);
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
    Signal.join(imports, compiledNotes).map(([imports, compiledNotes]) => {
      const noteEnv = new Map<string, CompiledNote>();
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
      return noteEnv;
    });
  const moduleTypeEnv =
    Signal.joinMap(Signal.mapMap(noteEnv, note => note.exportType));
  const moduleValueEnv =
    noteEnv.map(noteEnv => MapFuncs.map(noteEnv, note => note.exportValue));

  const pathParsed = Path.parse(file.path);
  const jsonPath = Path.format({ ...pathParsed, base: undefined, ext: '.json' });
  const tablePath = Path.format({ ...pathParsed, base: undefined, ext: '.table' });

  const jsonType = compiledFiles.flatMap(compiledFiles => {
    const json = compiledFiles.get(jsonPath);
    if (json)
      return json.exportType.map(exportType =>
        exportType.getFieldType('mutable')
      );
    else
      return Signal.ok(undefined);
  });
  const jsonValue = compiledFiles.flatMap(compiledFiles => {
    const json = compiledFiles.get(jsonPath);
    if (json)
      return json.exportValue.flatMap(exportValue =>
        exportValue['mutable'] ?? Signal.ok(undefined)
      );
    else
      return Signal.ok(undefined);
  });
  const tableType = compiledFiles.flatMap(compiledFiles => {
    const table = compiledFiles.get(tablePath);
    if (table)
      return table.exportType.map(exportType =>
        exportType.getFieldType('default')
      );
    else
      return Signal.ok(undefined);
  });
  const tableValue = compiledFiles.flatMap(compiledFiles => {
    const table = compiledFiles.get(tablePath);
    if (table)
      return table.exportValue.flatMap(exportValue =>
        exportValue['default'] ?? Signal.ok(undefined)
      );
    else
      return Signal.ok(undefined);
  });

  // TODO(jaked)
  // finer-grained deps so we don't rebuild all code e.g. when json changes
  const typecheckCode = Signal.join(
    codeNodes,
    jsonType,
    tableType,
    moduleTypeEnv
  ).map(([codeNodes, jsonType, tableType, moduleTypeEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let env = Render.initTypeEnv;

    if (jsonType) env = env.set('data', jsonType);
    if (tableType) env = env.set('table', tableType);

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
    // clone to avoid polluting annotations between versions
    // TODO(jaked) works fine but not very clear
    astAnnotations = new Map(astAnnotations);

    inlineCodeNodes.forEach(node =>
      synthInlineCode(node, env, astAnnotations)
    );
    const problems = [...astAnnotations.values()].some(t => t.kind === 'Error');
    return { astAnnotations, problems }
  });

  const ast = Signal.join(codeNodes, inlineCodeNodes).map(_ => parsedCode);

  // TODO(jaked)
  // finer-grained deps so we don't rebuild all code e.g. when json changes
  const compile = Signal.join(
    codeNodes,
    typecheckCode,
    jsonValue,
    tableValue,
    moduleValueEnv,
  ).map(([codeNodes, { astAnnotations }, jsonValue, tableValue, moduleValueEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let env = Render.initValueEnv(setSelected);

    if (jsonValue) env = env.set('data', Signal.ok(jsonValue));
    if (tableValue) env = env.set('table', Signal.ok(tableValue));

    const exportValue: { [s: string]: Signal<any> } = {};
    codeNodes.forEach(node =>
      env = compileCode(node, astAnnotations, moduleName, moduleValueEnv, env, exportValue)
    );
    return { env, exportValue };
   });

  const Link = makeLink(moduleName, setSelected);
   // TODO(jaked)
  // re-render only nodes that have changed since previous render
  // or when env changes
  const rendered = Signal.join(
    nodes,
    ast, // dependency to ensure parsedCode is up to date
    compile,
    typecheckInlineCode,
  ).flatMap(([nodes, _ast, { env }, { astAnnotations }]) => {
    return Signal.join(...nodes.map(node => renderNode(node, astAnnotations, env, Link)))
  });

  const debug = false;
  const meta = metaForPath(file.path, compiledFiles);
  const layoutFunction = Signal.join(
   meta,
   compiledNotes,
 ).flatMap(([meta, compiledNotes]) => {
   if (meta.layout) {
     if (debug) console.log(`meta.layout`);
     const layoutModule = compiledNotes.get(meta.layout);
     if (layoutModule) {
       if (debug) console.log(`layoutModule`);
       return layoutModule.exportType.flatMap(exportType => {
         const defaultType = exportType.getFieldType('default');
         if (defaultType) {
           if (debug) console.log(`defaultType`);
           if (Type.isSubtype(defaultType, Type.layoutFunctionType)) {
             if (debug) console.log(`isSubtype`);
             return layoutModule.exportValue.flatMap(exportValue =>
               exportValue['default']
             );
           }
         }
         return Signal.ok(undefined);
       });
     }
   }
   return Signal.ok(undefined);
 });

 const renderedWithLayout = Signal.join(
    rendered,
    meta,
    layoutFunction,
  ).map(([rendered, meta, layoutFunction]) => {
    if (layoutFunction)
      return layoutFunction({ children: rendered, meta });
    else
      return rendered
  });

  return {
    ast,
    exportType: typecheckCode.map(({ exportType }) => exportType),
    astAnnotations: typecheckInlineCode.map(({ astAnnotations }) => astAnnotations),
    problems: typecheckInlineCode.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compile.map(({ exportValue }) => exportValue),
    rendered: renderedWithLayout,
  };
}
