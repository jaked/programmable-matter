import Path from 'path';
import * as Immutable from 'immutable';
import * as Immer from 'immer';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import JSON5 from 'json5';

import { bug } from '../../util/bug';
import * as model from '../../model';
import * as Name from '../../util/Name';
import * as MapFuncs from '../../util/MapFuncs';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import { TypesMap, CompiledFile, CompiledNote, CompiledNotes, WritableContent } from '../../model';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import * as Evaluate from '../Evaluate';
import * as Render from '../Render';
import * as Generate from '../Generate';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Dyncheck from '../Dyncheck';
import lensValue from './lensValue';

import makeLink from '../../components/makeLink';

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

function typecheckCode(
  moduleName: string,
  node: PMAST.Code,
  moduleEnv: Map<string, Type.ModuleType>,
  typeEnv: Typecheck.Env,
  exportTypes: { [s: string]: Type },
  typesMap: TypesMap,
): Typecheck.Env {
  const code = parsedCode.get(node) ?? bug('expected parsed code');
  code.forEach(code => {
    typeEnv = Typecheck.synthProgram(
      moduleName,
      moduleEnv,
      code as ESTree.Program,
      typeEnv,
      exportTypes,
      typesMap
    );
  });
  return typeEnv;
}

function dyncheckCode(
  moduleName: string,
  node: PMAST.Code,
  moduleEnv: Map<string, Map<string, boolean>>,
  typeEnv: Render.TypeEnv,
  dynamicEnv: Render.DynamicEnv,
  exportDynamic: Map<string, boolean>,
): Render.DynamicEnv {
  const code = parsedCode.get(node) ?? bug('expected parsed code');
  code.forEach(code => {
    dynamicEnv = Dyncheck.program(
      moduleName,
      moduleEnv,
      code as ESTree.Program,
      typeEnv,
      dynamicEnv,
      exportDynamic,
    );
  });
  return dynamicEnv;
}

function typecheckInlineCode(
  node: PMAST.InlineCode,
  env: Typecheck.Env,
  typesMap: TypesMap,
) {
  const code = parsedCode.get(node) ?? bug('expected parsed code');
  code.forEach(code =>
    Typecheck.check(code as ESTree.Expression, env, Type.reactNodeType, typesMap)
  );
}

function isDynamic(
  ast: ESTree.Expression,
  dynamicEnv: Render.DynamicEnv
): boolean {
  return ESTree.freeIdentifiers(ast).some(ident => {
    const dynamic = dynamicEnv.get(ident) ?? bug(`expected dynamic`);
    return dynamic
  });
}

function evaluateExpressionSignal(
  ast: ESTree.Expression,
  typesMap: TypesMap,
  dynamicEnv: Render.DynamicEnv,
  valueEnv: Render.ValueEnv,
): Signal<unknown> {
  const dynamicIdents = ESTree.freeIdentifiers(ast).filter(ident => {
    const dynamic = dynamicEnv.get(ident) ?? bug(`expected dynamic`);
    return dynamic
  });
  const signals = dynamicIdents.map(id =>
    (valueEnv.get(id) as Signal<unknown>) ?? bug(`expected signal`)
  );
  return Signal.join(...signals).map(values => {
    valueEnv = valueEnv.concat(Immutable.Map(dynamicIdents.map((id, i) => [id, values[i]])));
    return Evaluate.evaluateExpression(ast, typesMap, valueEnv);
  });
}

function importDecl(
  mdxName: string,
  decl: ESTree.ImportDeclaration,
  moduleDynamicEnv: Map<string, Map<string, boolean>>,
  moduleValueEnv: Map<string, Map<string, unknown>>,
  typesMap: TypesMap,
  valueEnv: Render.ValueEnv,
): Render.ValueEnv {
  // TODO(jaked) finding errors in the AST is delicate.
  // need to separate error semantics from error highlighting.
  const type = typesMap.get(decl.source);
  if (type && type.kind === 'Error') {
    decl.specifiers.forEach(spec => {
      valueEnv = valueEnv.set(spec.local.name, type.err);
    });
  } else {
    const moduleName = Name.rewriteResolve(moduleValueEnv, mdxName, decl.source.value) || bug(`expected module '${decl.source.value}'`);
    const moduleValue = moduleValueEnv.get(moduleName) ?? bug(`expected moduleValue`);
    const moduleDynamic = moduleDynamicEnv.get(moduleName) ?? bug(`expected moduleDynamic`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          // TODO(jaked) carry dynamic flags in Type.ModuleType
          // so we can distinguish dynamic/static module members at the point of use
          // for now if any member is dynamic the whole module is dynamic, else static
          let value;
          if ([...moduleDynamic.values()].some(dynamic => dynamic)) {
            value = Signal.joinMap(Signal.ok(MapFuncs.map(moduleValue, (v, k) => {
              if (moduleDynamic.get(k) ?? bug(`expected dynamic`))
                return v as Signal<unknown>;
              else
                return Signal.ok(v);
            })))
              .map(moduleValue => Object.fromEntries(moduleValue.entries()));
          } else {
            value = Object.fromEntries(moduleValue.entries());
          }
          valueEnv = valueEnv.set(spec.local.name, value);
          break;
        }

        case 'ImportDefaultSpecifier': {
          const type = typesMap.get(spec.local);
          if (type && type.kind === 'Error') {
            valueEnv = valueEnv.set(spec.local.name, type.err);
          } else {
            const defaultField = moduleValue.get('default') ?? bug(`expected default`);
            valueEnv = valueEnv.set(spec.local.name, defaultField);
          }
        }
        break;

        case 'ImportSpecifier': {
          const type = typesMap.get(spec.imported);
          if (type && type.kind === 'Error') {
            valueEnv = valueEnv.set(spec.local.name, type.err);
          } else {
            const importedField = moduleValue.get(spec.imported.name) ?? bug(`expected ${spec.imported.name}`);
            valueEnv = valueEnv.set(spec.local.name, importedField);
          }
        }
        break;
      }
    });
  }
  return valueEnv;
}

function evalVariableDecl(
  nodes: Signal.Writable<PMAST.Node[]>,
  node: PMAST.Code,
  decl: ESTree.VariableDeclaration,
  typesMap: TypesMap,
  dynamicEnv: Render.DynamicEnv,
  valueEnv: Render.ValueEnv,
  exportValue?: Map<string, unknown>
): Render.ValueEnv {
  switch (decl.kind) {
    case 'const': {
      decl.declarations.forEach(declarator => {
        const name = declarator.id.name;
        const value =
          (dynamicEnv.get(name) ?? bug(`expected dynamic`)) ?
            evaluateExpressionSignal(declarator.init, typesMap, dynamicEnv, valueEnv) :
            Evaluate.evaluateExpression(declarator.init, typesMap, valueEnv);
        if (exportValue) exportValue.set(name, value);
        valueEnv = valueEnv.set(name, value);
      });
    }
    break;

    case 'let': {
      decl.declarations.forEach(declarator => {
        let name = declarator.id.name;
        const lensType = typesMap.get(declarator.id) ?? bug(`expected type`);
        if (lensType.kind === 'Error') return valueEnv;
        else if (lensType.kind !== 'Abstract' || lensType.params.size !== 1) bug(`expected lensType`);
        const type = lensType.params.get(0) ?? bug(`expected param`);
        const init = declarator.init;
        const value = Evaluate.evaluateExpression(init, typesMap, Immutable.Map({ undefined: undefined }));
        const setValue = (v) => {
          nodes.produce(nodes => {
            function walk(nodes: PMAST.Node[]): boolean {
              for (let i = 0; i < nodes.length; i++) {
                const oldNode = nodes[i];
                if (Immer.original(oldNode) === node) {
                  const code =
                    (node.children[0] && PMAST.isText(node.children[0]) && node.children[0].text) ||
                    bug(`expected text child`);
                  const newNode: PMAST.Node = { type: 'code', children: [{ text:
                    code.substr(0, init.start) + JSON5.stringify(v) + code.substr(init.end)
                  }]};
                  nodes[i] = newNode;
                  return true;
                } else if (PMAST.isElement(oldNode)) {
                  if (walk(oldNode.children)) {
                    return true;
                  }
                }
              }
              return false;
            }

            if (!walk(nodes)) bug(`expected node`);
          });
          // TODO(jaked)
          // what if changing node invalidates selection?
          // how can we avoid recompiling the note / dependents?
          //   put a cell in the environment so we can update it
          //   Signal.Writable that writes back to node?
        }
        const lens = Signal.ok(lensValue(value, setValue, type));
        if (exportValue) exportValue.set(name, lens);
        valueEnv = valueEnv.set(name, lens);
      });
    }
    break;

    default: throw new Error('unexpected AST ' + decl.kind);
  }
  return valueEnv;
}

function evalAndExportNamedDecl(
  nodes: Signal.Writable<PMAST.Node[]>,
  node: PMAST.Code,
  decl: ESTree.ExportNamedDeclaration,
  typesMap: TypesMap,
  dynamicEnv: Render.DynamicEnv,
  valueEnv: Render.ValueEnv,
  exportValue: Map<string, unknown>
): Render.ValueEnv {
  return evalVariableDecl(nodes, node, decl.declaration, typesMap, dynamicEnv, valueEnv, exportValue);
}

function exportDefaultDecl(
  decl: ESTree.ExportDefaultDeclaration,
  typesMap: TypesMap,
  dynamicEnv: Render.DynamicEnv,
  valueEnv: Render.ValueEnv,
  exportValue: Map<string, unknown>
): Render.ValueEnv {
  const value =
    (dynamicEnv.get('default') ?? bug(`expected dynamic`)) ?
      evaluateExpressionSignal(decl.declaration, typesMap, dynamicEnv, valueEnv) :
      Evaluate.evaluateExpression(decl.declaration, typesMap, valueEnv);
  exportValue.set('default', value);
  return valueEnv;
}

export function compileCode(
  nodes: Signal.Writable<PMAST.Node[]>,
  node: PMAST.Code,
  typesMap: TypesMap,
  moduleName: string,
  moduleDynamicEnv: Map<string, Map<string, boolean>>,
  moduleValueEnv: Map<string, Map<string, unknown>>,
  dynamicEnv: Render.DynamicEnv,
  valueEnv: Render.ValueEnv,
  exportValue: Map<string, unknown>
): Render.ValueEnv {
  const code = parsedCode.get(node) ?? bug(`expected parsed code`);
  code.forEach(code => {
    for (const decl of (code as ESTree.Program).body) {
      switch (decl.type) {
        case 'ImportDeclaration':
          valueEnv = importDecl(moduleName, decl, moduleDynamicEnv, moduleValueEnv, typesMap, valueEnv);
          break;

        case 'ExportNamedDeclaration':
          valueEnv = evalAndExportNamedDecl(nodes, node, decl, typesMap, dynamicEnv, valueEnv, exportValue);
          break;

        case 'ExportDefaultDeclaration':
          valueEnv = exportDefaultDecl(decl, typesMap, dynamicEnv, valueEnv, exportValue);
          break;

        case 'VariableDeclaration':
          valueEnv = evalVariableDecl(nodes, node, decl, typesMap, dynamicEnv, valueEnv);
          break;
      }
    }
  });
  return valueEnv;
}

// memo table of rendered static nodes
// code nodes or nodes containing code nodes are not memoized
// since their rendering may depend on typechecking etc.
const renderedNode = new WeakMap<PMAST.Node, React.ReactNode>();

export function renderNode(
  node: PMAST.Node,
  typesMap: TypesMap,
  dynamicEnv: Render.DynamicEnv,
  valueEnv: Render.ValueEnv,
  nextRootId: [ number ],
  Link: React.FunctionComponent<{ href: string }> = () => null,
): React.ReactNode {
  const rendered = renderedNode.get(node);
  if (rendered) return rendered;
  const key = findKey(node);
  if ('text' in node) {
    let text: any = node.text;
    if (node.bold)          text = <strong>{text}</strong>;
    if (node.italic)        text = <em>{text}</em>;
    if (node.underline)     text = <u>{text}</u>;
    if (node.strikethrough) text = <del>{text}</del>;
    if (node.subscript)     text = <sub>{text}</sub>;
    if (node.superscript)   text = <sup>{text}</sup>
    if (node.code)          text = <code>{text}</code>;
    const rendered = <span key={key}>{text}</span>;
    renderedNode.set(node, rendered);
    return rendered;
  } else {
    if (node.type === 'code') {
      const code = parsedCode.get(node) ?? bug(`expected parsed code`);
      if (code.type !== 'ok') return null;
      const rendered: React.ReactNode[] = [];
      for (const node of (code.ok as ESTree.Program).body) {
        if (node.type === 'ExpressionStatement') {
          const type = typesMap.get(node.expression) ?? bug(`expected type`);
          if (type.kind !== 'Error') {
            if (isDynamic(node.expression, dynamicEnv)) {
              const signal = evaluateExpressionSignal(node.expression, typesMap, dynamicEnv, valueEnv) as Signal<React.ReactNode>;
              rendered.push(<div id={`__root${nextRootId[0]}`}>{Signal.node(signal)}</div>);
              nextRootId[0]++;
            } else {
              rendered.push(Evaluate.evaluateExpression(node.expression, typesMap, valueEnv));
            }
          }
        }
      }
      return <>{...rendered}</>;

    } else if (node.type === 'inlineCode') {
      const code = parsedCode.get(node) ?? bug(`expected parsed code`);
      if (code.type !== 'ok') return null;
      const expr = code.ok as ESTree.Expression;
      const type = typesMap.get(expr) ?? bug(`expected type`);
      if (type.kind === 'Error') return null;
      if (isDynamic(expr, dynamicEnv)) {
        const signal = evaluateExpressionSignal(expr, typesMap, dynamicEnv, valueEnv) as Signal<React.ReactNode>;
        const elem = <span id={`__root${nextRootId[0]}`}>{Signal.node(signal)}</span>;
        nextRootId[0]++;
        return elem;
      } else {
        return Evaluate.evaluateExpression(expr, typesMap, valueEnv)
      }

    } else {
      const children = node.children.map(child => renderNode(child, typesMap, dynamicEnv, valueEnv, nextRootId, Link));
      let rendered;
      if (node.type === 'a') {
        rendered = React.createElement(Link, { key, href: node.href }, ...children);
      } else {
        rendered = React.createElement(node.type, { key }, ...children);
      }
      if (node.children.every(node => renderedNode.has(node)))
        renderedNode.set(node, rendered);
      return rendered;
    }
  }
}

export default function compileFilePm(
  file: WritableContent,
  compiledFiles: Signal<Map<string, CompiledFile>> = Signal.ok(new Map()),
  compiledNotes: Signal<CompiledNotes> = Signal.ok(new Map()),
  setSelected: (note: string) => void = (note: string) => { },
): CompiledFile {
  const moduleName = Name.nameOfPath(file.path);

  // TODO(jaked) Signal function to project from a Writable
  const nodes = (file.content as Signal.Writable<model.PMContent>).mapWritable(
      content => content.nodes,
      nodes => ({ nodes, meta: (file.content.get() as model.PMContent).meta })
  );

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
  const moduleDynamicEnv =
    Signal.joinMap(Signal.mapMap(noteEnv, note => note.exportDynamic));
  const moduleValueEnv =
    Signal.joinMap(Signal.mapMap(noteEnv, note => note.exportValue));

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
      return json.exportValue.map(exportValue =>
        exportValue.get('mutable') ?? bug(`expected mutable`)
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
      return table.exportValue.map(exportValue =>
        exportValue.get('default') ?? bug(`expected default`)
      );
    else
      return Signal.ok(undefined);
  });

  // TODO(jaked)
  // finer-grained deps so we don't rebuild all code e.g. when json changes
  const typecheckedCode = Signal.join(
    codeNodes,
    jsonType,
    tableType,
    moduleTypeEnv,
    moduleDynamicEnv,
  ).map(([codeNodes, jsonType, tableType, moduleTypeEnv, moduleDynamicEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let typeEnv = Render.initTypeEnv;
    let dynamicEnv = Render.initDynamicEnv;

    if (jsonType) {
      typeEnv = typeEnv.set('data', jsonType);
      dynamicEnv = dynamicEnv.set('data', false);
    }
    if (tableType) {
      typeEnv = typeEnv.set('table', tableType);
      dynamicEnv = dynamicEnv.set('table', false);
    }

    const exportTypes: { [s: string]: Type.Type } = {};
    const exportDynamic: Map<string, boolean> = new Map();
    const typesMap = new Map<unknown, Type>();
    codeNodes.forEach(node => {
      typeEnv = typecheckCode(
        moduleName,
        node,
        moduleTypeEnv,
        typeEnv,
        exportTypes,
        typesMap
      );
      dynamicEnv = dyncheckCode(
        moduleName,
        node,
        moduleDynamicEnv,
        typeEnv,
        dynamicEnv,
        exportDynamic
      );
    });
    const exportType = Type.module(exportTypes);
    return { typesMap, typeEnv, exportType, dynamicEnv, exportDynamic }
  });

  // TODO(jaked)
  // re-typecheck only nodes that have changed since previous render
  // or when env changes
  const typecheckedInlineCode = Signal.join(
    typecheckedCode,
    inlineCodeNodes,
  ).map(([{ typesMap, typeEnv }, inlineCodeNodes]) => {
    // clone to avoid polluting annotations between versions
    // TODO(jaked) works fine but not very clear
    typesMap = new Map(typesMap);

    inlineCodeNodes.forEach(node =>
      typecheckInlineCode(node, typeEnv, typesMap)
    );
    const problems = [...typesMap.values()].some(t => t.kind === 'Error');
    if (problems && debug) {
      const errorAnnotations = new Map<unknown, Type>();
      typesMap.forEach((v, k) => {
        if (v.kind === 'Error')
          errorAnnotations.set(k, v);
      });
      console.log(errorAnnotations);
    }
    return { typesMap, problems }
  });

  // TODO(jaked)
  // finer-grained deps so we don't rebuild all code e.g. when json changes
  const compile = Signal.join(
    codeNodes,
    typecheckedCode,
    jsonValue,
    tableValue,
    moduleDynamicEnv,
    moduleValueEnv,
  ).map(([codeNodes, { typesMap, dynamicEnv }, jsonValue, tableValue, moduleDynamicEnv, moduleValueEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let valueEnv = Render.initValueEnv;

    if (jsonValue) valueEnv = valueEnv.set('data', jsonValue);
    if (tableValue) valueEnv = valueEnv.set('table', tableValue);

    const exportValue: Map<string, Signal<unknown>> = new Map();
    codeNodes.forEach(node =>
      valueEnv = compileCode(nodes, node, typesMap, moduleName, moduleDynamicEnv, moduleValueEnv, dynamicEnv, valueEnv, exportValue)
    );
    return { valueEnv, exportValue };
  });

  const Link = makeLink(moduleName, setSelected);

  const ast = Signal.join(codeNodes, inlineCodeNodes).map(_ => parsedCode);

  // TODO(jaked)
  // re-render only nodes that have changed since previous render
  // or when env changes
  const rendered = Signal.join(
    nodes,
    ast, // dependency to ensure parsedCode is up to date
    compile,
    typecheckedCode,
    typecheckedInlineCode,
  ).map(([nodes, _ast, { valueEnv }, { dynamicEnv }, { typesMap }]) => {
    const nextRootId: [ number ] = [ 0 ];
    return nodes.map(node => renderNode(node, typesMap, dynamicEnv, valueEnv, nextRootId, Link));
  });

  const html = rendered.map(rendered => {
    const renderedWithContext =
      React.createElement(Render.context.Provider, { value: 'server' }, rendered)
    const html = ReactDOMServer.renderToStaticMarkup(renderedWithContext);
    const script = `<script type='module' src='${moduleName}.js'></script>`
    const headIndex = html.indexOf('</head>');
    if (headIndex === -1) {
      return `<html>
<head>
${script}
</head>
<body>
${html}
</body>
</html>`
    } else {
      return `${html.slice(0, headIndex)}${script}${html.slice(headIndex)}`;
    }
  });

  const js = Signal.join(
    nodes,
    ast,
    typecheckedInlineCode
  ).map(([nodes, parsedCode, { typesMap }]) => {
    return Generate.generatePm(
      nodes,
      node => parsedCode.get(node) ?? bug(`expected parsed code`),
      expr => typesMap.get(expr) ?? bug(`expected type for ${JSON.stringify(expr)}`),
    );
  })

  const debug = false;
  const meta = (file.content as Signal.Writable<model.PMContent>).map(content => content.meta);
  const layoutFunction = Signal.join(
   meta,
   compiledNotes,
 ).flatMap(([meta, compiledNotes]) => {
  if (meta.layout) {
    if (debug) console.log(`meta.layout`);
    const layoutModule = compiledNotes.get(meta.layout);
    if (layoutModule) {
      if (debug) console.log(`layoutModule`);
      return Signal.join(
        layoutModule.exportType,
        layoutModule.exportDynamic,
        layoutModule.exportValue,
      ).map(([exportType, exportDynamic, exportValue]) => {
        const defaultType = exportType.getFieldType('default');
        if (defaultType) {
          if (debug) console.log(`defaultType`);
          if (Type.isSubtype(defaultType, Type.layoutFunctionType)) {
            if (debug) console.log(`isSubtype`);
            const dynamic = exportDynamic.get('default') ?? bug(`expected default`);
            // TODO(jaked)
            // a dynamic layout forces the whole page to be dynamic, would that be ok?
            // also a static layout should be able to contain dynamic elements
            // but the type system doesn't capture this adequately
            if (!dynamic) {
              if (debug) console.log(`!dynamic`);
              return exportValue.get('default') ?? bug(`expected default`);
            }
          }
        }
        return undefined;
      });
    }
  }
  return Signal.ok(undefined);
 });

  // the purpose of this wrapper is to avoid remounts when `component` changes.
  // React assumes that a changed component is likely to be very different,
  // so remounts the whole tree, losing the state of stateful DOM components.
  // TODO(jaked) memoize on individual props?
  const functionComponent = React.memo<{ component, props }>(({ component, props }) =>
    component(props)
  )

 const renderedWithLayout = Signal.join(
    rendered,
    meta,
    layoutFunction,
  ).map(([rendered, meta, layoutFunction]) => {
    if (layoutFunction) {
      return React.createElement(
        functionComponent,
        { component: layoutFunction, props: { children: rendered, meta }}
      );
    } else
      return rendered
  });

  return {
    ast,
    typesMap: typecheckedInlineCode.map(({ typesMap }) => typesMap),
    problems: typecheckedInlineCode.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    rendered: renderedWithLayout,

    exportType: typecheckedCode.map(({ exportType }) => exportType),
    exportValue: compile.map(({ exportValue }) => exportValue),
    exportDynamic: typecheckedCode.map(({ exportDynamic }) => exportDynamic),

    html,
    js,
  };
}
