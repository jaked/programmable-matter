import Path from 'path';
import * as Immutable from 'immutable';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import { bug } from '../../util/bug';
import * as model from '../../model';
import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import { Interface, InterfaceMap, CompiledFile, CompiledNote, CompiledNotes, WritableContent } from '../../model';
import * as PMAST from '../../pmast';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import * as Evaluate from '../Evaluate';
import * as Render from '../Render';
import * as Generate from '../Generate';
import Type from '../Type';
import Typecheck from '../Typecheck';

import makeLink from '../../components/makeLink';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

const intfDynamic = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.dynamic : false;

function typecheckCode(
  node: PMAST.LiveCode,
  moduleInterfaceEnv: Map<string, Map<string, Interface>>,
  interfaceEnv: Typecheck.Env,
  interfaceMap: InterfaceMap,
): Typecheck.Env {
  const code = Parse.parseLiveCodeNode(node);
  code.forEach(code => {
    interfaceEnv = Typecheck.synthProgram(
      moduleInterfaceEnv,
      code,
      interfaceEnv,
      interfaceMap
    );
  });
  return interfaceEnv;
}

function typecheckInlineCode(
  node: PMAST.InlineLiveCode,
  interfaceEnv: Typecheck.Env,
  interfaceMap: InterfaceMap,
) {
  const code = Parse.parseInlineLiveCodeNode(node);
  code.forEach(code => {
    Typecheck.check(code, interfaceEnv, Type.reactNodeType, interfaceMap);
  });
}

export default function compileFilePm(
  file: WritableContent,
  compiledFiles: Signal<Map<string, CompiledFile>> = Signal.ok(new Map()),
  compiledNotes: Signal<CompiledNotes> = Signal.ok(new Map()),
  setSelected: (note: string) => void = (note: string) => { },
): CompiledFile {
  const moduleName = Name.nameOfPath(file.path);

  // TODO(jaked) Signal function to project from a Writable
  const nodes = (file.content as Signal.Writable<model.PMContent>).mapInvertible(
    content => content.children,
    children => {
      const pmContent = file.content.get() as model.PMContent;
      return {
        children,
        meta: pmContent.meta
      };
    }
  );

  // TODO(jaked)
  // we want just the bindings and imports here, but this also includes ExpressionStatements
  const codeNodes = nodes.map(nodes =>
    Immutable.List<PMAST.LiveCode>().withMutations(codeNodes => {
      function pushCodeNodes(node: PMAST.Node) {
        if (PMAST.isLiveCode(node)) {
          codeNodes.push(node);
        } else if (PMAST.isElement(node)) {
          node.children.forEach(pushCodeNodes);
        }
      }
      nodes.forEach(pushCodeNodes);
    })
  );

  const inlineCodeNodes = nodes.map(nodes =>
    Immutable.List<PMAST.InlineLiveCode>().withMutations(inlineCodeNodes => {
      function pushInlineCodeNodes(node: PMAST.Node) {
        if (PMAST.isInlineLiveCode(node)) {
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
        const code = Parse.parseLiveCodeNode(node);
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
  const moduleInterfaceEnv =
    Signal.joinMap(Signal.mapMap(noteEnv, note => note.exportInterface));
  const moduleValueEnv =
    Signal.joinMap(Signal.mapMap(noteEnv, note => note.exportValue));

  const pathParsed = Path.parse(file.path);
  const jsonPath = Path.format({ ...pathParsed, base: undefined, ext: '.json' });
  const tablePath = Path.format({ ...pathParsed, base: undefined, ext: '.table' });

  const jsonIntf = compiledFiles.flatMap(compiledFiles => {
    const json = compiledFiles.get(jsonPath);
    if (json)
      return json.exportInterface.map(exportInterface =>
        exportInterface.get('mutable')
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
  const tableIntf = compiledFiles.flatMap(compiledFiles => {
    const table = compiledFiles.get(tablePath);
    if (table)
      return table.exportInterface.map(exportInterface =>
        exportInterface.get('default')
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
    jsonIntf,
    tableIntf,
    moduleInterfaceEnv,
  ).map(([codeNodes, jsonIntf, tableIntf, moduleInterfaceEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let interfaceEnv = Render.initInterfaceEnv;

    if (jsonIntf) {
      interfaceEnv = interfaceEnv.set('data', jsonIntf);
    }
    if (tableIntf) {
      interfaceEnv = interfaceEnv.set('table', tableIntf);
    }

    const interfaceMap = new Map<ESTree.Node, Interface>();
    codeNodes.forEach(node => {
      interfaceEnv = typecheckCode(
        node,
        moduleInterfaceEnv,
        interfaceEnv,
        interfaceMap
      );
    });
    return { interfaceEnv, interfaceMap }
  });

  // TODO(jaked)
  // re-typecheck only nodes that have changed since previous render
  // or when env changes
  const typecheckedInlineCode = Signal.join(
    typecheckedCode,
    inlineCodeNodes,
  ).map(([{ interfaceEnv, interfaceMap }, inlineCodeNodes]) => {
    // clone to avoid polluting annotations between versions
    // TODO(jaked) works fine but not very clear
    interfaceMap = new Map(interfaceMap);

    inlineCodeNodes.forEach(node => {
      typecheckInlineCode(node, interfaceEnv, interfaceMap);
    });
    const problems = [...interfaceMap.values()].some(intf => intf.type === 'err');
    if (problems && debug) {
      const errorAnnotations = new Map<unknown, Interface>();
      interfaceMap.forEach((intf, node) => {
        if (intf.type === 'err')
          errorAnnotations.set(node, intf);
      });
      console.log(errorAnnotations);
    }
    return { interfaceMap, problems }
  });

  // TODO(jaked)
  // finer-grained deps so we don't rebuild all code e.g. when json changes
  const compile = Signal.join(
    codeNodes,
    typecheckedCode,
    jsonValue,
    tableValue,
    moduleValueEnv,
  ).map(([codeNodes, { interfaceMap }, jsonValue, tableValue, moduleValueEnv]) => {
    // TODO(jaked) pass into compileFilePm
    let valueEnv = Render.initValueEnv;

    if (jsonValue) valueEnv = valueEnv.set('data', jsonValue);
    if (tableValue) valueEnv = valueEnv.set('table', tableValue);

    const exportValue: Map<string, Signal<unknown>> = new Map();
    codeNodes.forEach(node =>
      valueEnv = Evaluate.evaluateCodeNode(
        nodes,
        node,
        interfaceMap,
        moduleValueEnv,
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
    typecheckedInlineCode,
  ).map(([nodes, { valueEnv }, { interfaceMap }]) => {
    const nextRootId: [ number ] = [ 0 ];
    return nodes.map(node => Render.renderNode(node, interfaceMap, valueEnv, nextRootId, Link));
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
        layoutModule.exportInterface,
        layoutModule.exportValue,
      ).map(([exportInterface, exportValue]) => {
        const defaultIntf = exportInterface.get('default');
        if (defaultIntf) {
          if (debug) console.log(`defaultType`);
          if (Type.isSubtype(intfType(defaultIntf), Type.layoutFunctionType)) {
            if (debug) console.log(`isSubtype`);
            const dynamic = intfDynamic(defaultIntf);
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
    typecheckedInlineCode,
  ).map(([nodes, { interfaceMap }]) => {
    return Generate.generatePm(
      nodes,
      expr => interfaceMap.get(expr) ?? bug(`expected interface for ${JSON.stringify(expr)}`)
    );
  });

  const exports = codeNodes.map(codeNodes =>
    Immutable.List<string>().withMutations(exports => {
      codeNodes.forEach(node => {
        const code = Parse.parseLiveCodeNode(node);
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

  const exportInterface = Signal.join(exports, typecheckedCode).map(([exportNames, { interfaceEnv }]) => {
    const exportInterface: Map<string, Interface> = new Map();
    exportNames.forEach(name => {
      exportInterface.set(name, interfaceEnv.get(name) ?? bug(`expected interface`));
    });
    return exportInterface;
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
    interfaceMap: typecheckedInlineCode.map(({ interfaceMap }) => interfaceMap),
    problems: typecheckedInlineCode.liftToTry().map(compiled => {
      if (compiled.type === 'err') {
        console.log(compiled.err);
        return true;
      } else {
        return compiled.ok.problems;
      }
    }),
    rendered: renderedWithLayout,

    exportInterface,
    exportValue,

    html,
    js,
  };
}
