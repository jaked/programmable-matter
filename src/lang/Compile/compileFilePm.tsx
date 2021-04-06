import Path from 'path';
import * as Immutable from 'immutable';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import { bug } from '../../util/bug';
import * as model from '../../model';
import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import { TypeMap, CompiledFile, CompiledNote, CompiledNotes, WritableContent } from '../../model';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import * as Evaluate from '../Evaluate';
import * as Render from '../Render';
import * as Generate from '../Generate';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Dyncheck from '../Dyncheck';

import makeLink from '../../components/makeLink';

function typecheckCode(
  node: PMAST.Code,
  moduleEnv: Map<string, Type.ModuleType>,
  typeEnv: Typecheck.Env,
  typeMap: TypeMap,
): Typecheck.Env {
  const code = Parse.parseCodeNode(node);
  code.forEach(code => {
    typeEnv = Typecheck.synthProgram(
      moduleEnv,
      code,
      typeEnv,
      typeMap
    );
  });
  return typeEnv;
}

function dyncheckCode(
  node: PMAST.Code,
  moduleEnv: Map<string, Map<string, boolean>>,
  typeEnv: Typecheck.Env,
  dynamicEnv: Dyncheck.Env,
): Dyncheck.Env {
  const code = Parse.parseCodeNode(node);
  code.forEach(code => {
    dynamicEnv = Dyncheck.program(
      moduleEnv,
      code,
      typeEnv,
      dynamicEnv,
    );
  });
  return dynamicEnv;
}

function typecheckInlineCode(
  node: PMAST.InlineCode,
  env: Typecheck.Env,
  typeMap: TypeMap,
) {
  const code = Parse.parseInlineCodeNode(node);
  code.forEach(code =>
    Typecheck.check(code as ESTree.Expression, env, Type.reactNodeType, typeMap)
  );
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
      function pushCodeNodes(node: PMAST.Node) {
        if (PMAST.isCode(node)) {
          codeNodes.push(node);
        } else if (PMAST.isElement(node)) {
          node.children.forEach(pushCodeNodes);
        }
      }
      nodes.forEach(pushCodeNodes);
    })
  );

  const inlineCodeNodes = nodes.map(nodes =>
    Immutable.List<PMAST.InlineCode>().withMutations(inlineCodeNodes => {
      function pushInlineCodeNodes(node: PMAST.Node) {
        if (PMAST.isInlineCode(node)) {
          inlineCodeNodes.push(node);
        } else if (PMAST.isElement(node)) {
          node.children.forEach(pushInlineCodeNodes);
        }
      }
      nodes.forEach(pushInlineCodeNodes);
    })
  );

  const imports = codeNodes.map(codeNodes =>
    Immutable.List<string>().withMutations(imports => {
      codeNodes.forEach(node => {
        const code = Parse.parseCodeNode(node);
        code.forEach(code =>
          code.body.forEach(node => {
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
        const resolvedName = Name.rewriteResolve(compiledNotes, moduleName, name);
        if (resolvedName) {
          const note = compiledNotes.get(resolvedName) ?? bug(`expected module '${resolvedName}'`);
          noteEnv.set(name, note);
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

    const typeMap = new Map<ESTree.Node, Type>();
    codeNodes.forEach(node => {
      typeEnv = typecheckCode(
        node,
        moduleTypeEnv,
        typeEnv,
        typeMap
      );
      dynamicEnv = dyncheckCode(
        node,
        moduleDynamicEnv,
        typeEnv,
        dynamicEnv,
      );
    });
    return { typeMap, typeEnv, dynamicEnv }
  });

  // TODO(jaked)
  // re-typecheck only nodes that have changed since previous render
  // or when env changes
  const typecheckedInlineCode = Signal.join(
    typecheckedCode,
    inlineCodeNodes,
  ).map(([{ typeMap, typeEnv }, inlineCodeNodes]) => {
    // clone to avoid polluting annotations between versions
    // TODO(jaked) works fine but not very clear
    typeMap = new Map(typeMap);

    inlineCodeNodes.forEach(node =>
      typecheckInlineCode(node, typeEnv, typeMap)
    );
    const problems = [...typeMap.values()].some(t => t.kind === 'Error');
    if (problems && debug) {
      const errorAnnotations = new Map<unknown, Type>();
      typeMap.forEach((v, k) => {
        if (v.kind === 'Error')
          errorAnnotations.set(k, v);
      });
      console.log(errorAnnotations);
    }
    return { typeMap, problems }
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
  ).map(([codeNodes, { typeMap, dynamicEnv }, jsonValue, tableValue, moduleDynamicEnv, moduleValueEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let valueEnv = Render.initValueEnv;

    if (jsonValue) valueEnv = valueEnv.set('data', jsonValue);
    if (tableValue) valueEnv = valueEnv.set('table', tableValue);

    const exportValue: Map<string, Signal<unknown>> = new Map();
    codeNodes.forEach(node =>
      valueEnv = Evaluate.evaluateCodeNode(
        nodes,
        node,
        typeMap,
        moduleDynamicEnv,
        moduleValueEnv,
        dynamicEnv,
        valueEnv
      )
    );
    return { valueEnv, exportValue };
  });

  const Link = makeLink(moduleName, setSelected);

  // TODO(jaked)
  // re-render only nodes that have changed since previous render
  // or when env changes
  const rendered = Signal.join(
    nodes,
    compile,
    typecheckedCode,
    typecheckedInlineCode,
  ).map(([nodes, { valueEnv }, { dynamicEnv }, { typeMap }]) => {
    const nextRootId: [ number ] = [ 0 ];
    return nodes.map(node => Render.renderNode(node, typeMap, dynamicEnv, valueEnv, nextRootId, Link));
  });

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

  const html = renderedWithLayout.map(rendered => {
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
    typecheckedCode,
    typecheckedInlineCode,
  ).map(([nodes, { dynamicEnv }, { typeMap }]) => {
    return Generate.generatePm(
      nodes,
      expr => typeMap.get(expr) ?? bug(`expected type for ${JSON.stringify(expr)}`),
      dynamicEnv,
    );
  });

  const exports = codeNodes.map(codeNodes =>
    Immutable.List<string>().withMutations(exports => {
      codeNodes.forEach(node => {
        const code = Parse.parseCodeNode(node);
        code.forEach(code => {
          for (const decl of code.body) {
            switch (decl.type) {
              case 'ExportNamedDeclaration':
                decl.declaration.declarations.forEach(declarator => {
                  exports.push(declarator.id.name);
                })
                break;

              case 'ExportDefaultDeclaration':
                exports.push('default');
                break;
            }
          }
        });
      });
    })
  );

  const exportType = Signal.join(exports, typecheckedCode).map(([exportNames, { typeEnv }]) => {
    const exportTypes: { [s: string]: Type.Type } = {};
    exportNames.forEach(name => {
      exportTypes[name] = typeEnv.get(name) ?? bug(`expected type`);
    });
    return Type.module(exportTypes);
  });

  const exportDynamic = Signal.join(exports, typecheckedCode).map(([exportNames, { dynamicEnv }]) => {
    const exportDynamic: Map<string, boolean> = new Map();
    exportNames.forEach(name => {
      exportDynamic.set(name, dynamicEnv.get(name) ?? bug(`expected dynamic`));
    });
    return exportDynamic;
  });

  const exportValue = Signal.join(exports, compile).map(([exportNames, { valueEnv }]) => {
    const exportValue: Map<string, unknown> = new Map();
    exportNames.forEach(name => {
      exportValue.set(name, valueEnv.get(name) ?? bug(`expected value`));
    });
    return exportValue;
  });

  return {
    ast: Signal.ok(null),
    typeMap: typecheckedInlineCode.map(({ typeMap }) => typeMap),
    problems: typecheckedInlineCode.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    rendered: renderedWithLayout,

    exportType,
    exportValue,
    exportDynamic,

    html,
    js,
  };
}
