import Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import * as Parse from '../Parse';
import * as Render from '../Render';
import * as MDXHAST from '../mdxhast';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import sortMdx from './sortMdx';
import * as data from '../../data';

import metaForFile from './metaForFile';

const debug = false;

function findImports(ast: MDXHAST.Node, layout: string | undefined) {
  const imports = Immutable.Set<string>().asMutable();
  if (layout !== undefined) imports.add(layout);
  function find(ast: MDXHAST.Node) {
    switch (ast.type) {
      case 'root':
      case 'element':
        return ast.children.forEach(child => find(child));

      case 'text':
      case 'jsx':
        break;

      case 'import':
      case 'export':
        if (!ast.declarations) throw new Error('expected import/export node to be parsed');
        ast.declarations.forEach(decls => decls.forEach(decl => {
          switch (decl.type) {
            case 'ImportDeclaration':
              imports.add(decl.source.value);
              break;
          }
        }));
        break;

      default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
    }
  }
  find(ast);
  return imports.asImmutable();
}

// TODO(jaked)
// is there a way to internalize Typescript types
// so we can generate these? like Scala implicits?
const metaType =
  Type.object({
    title: Type.undefinedOr(Type.string),
    tags: Type.undefinedOr(Type.array(Type.string)),
    layout: Type.string
  })

function compileMdx(
  trace: Trace,
  ast: MDXHAST.Root,
  meta: data.Meta,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluate.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
): data.Compiled {
  ast = trace.time('sortMdx', () => sortMdx(ast));

  const exportTypes: { [s: string]: Type.Type } = {};
  const astAnnotations = new Map<unknown, Try<Type>>();
  try {
    trace.time('synthMdx', () => Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes, astAnnotations));
  } catch (e) {
    const exportType = Type.module({ });
    const exportValue = { };
    const rendered = Signal.ok(false);
    return { exportType, exportValue, rendered, astAnnotations, problems: true };
  }

  let layoutFunction: undefined | Signal<(props: { children: React.ReactNode, meta: data.Meta }) => React.ReactNode>;
  if (meta.layout) {
    if (debug) console.log(`meta.layout`);
    const layoutType =
      Type.functionType(
        [ Type.object({
          children: Type.array(Type.reactNodeType),
          meta: metaType
        }) ],
        Type.reactNodeType);
    const layoutModule = moduleTypeEnv.get(meta.layout);
    if (layoutModule) {
      if (debug) console.log(`layoutModule`);
      const defaultType = layoutModule.get('default');
      if (defaultType) {
        if (debug) console.log(`defaultType`);
        if (Type.isSubtype(defaultType, layoutType)) {
          if (debug) console.log(`isSubtype`);
          const layoutModule = moduleValueEnv.get(meta.layout);
          if (layoutModule) {
            if (debug) console.log(`layoutModule`);
            layoutFunction = layoutModule.flatMap(layoutModule => layoutModule['default']);
          }
        }
      }
    }
  }

  const exportType = Type.module(exportTypes);
  const exportValue: { [s: string]: Signal<any> } = {};
  const rendered =
    trace.time('renderMdx', () => {
      const [_, node] =
        Render.renderMdx(ast, moduleValueEnv, valueEnv, exportValue);
      if (layoutFunction) {
        return Signal.join(layoutFunction, node).map(([layoutFunction, node]) =>
          layoutFunction({ children: node, meta })
        );
      }
      else return node;
    });
  return { exportType, exportValue, rendered, astAnnotations, problems: false };
}

export default function compileFileMdx(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  compiledNotes: Signal<data.CompiledNotes>,
  setSelected: (note: string) => void,
): Signal<data.CompiledFile> {
  // TODO(jaked) handle parse errors
  const ast = file.content.map(content => Parse.parse(trace, content));
  const meta = metaForFile(file, compiledFiles);
  const imports =
    Signal.join(ast, meta).map(([ast, meta]) => findImports(ast, meta.layout));

  // TODO(jaked) push note errors into envs so they're surfaced in editor?
  const noteEnv =
    Signal.join(imports, compiledNotes).map(([imports, compiledNotes]) => {
      const importedNotes = Immutable.Map<string, data.CompiledNote>().asMutable();
      imports.forEach(tag => {
        const note = compiledNotes.get(tag);
        if (note) importedNotes.set(tag, note);
      });
      return importedNotes.asImmutable();
    });
  const moduleTypeEnv = Signal.joinImmutableMap(
    noteEnv.map(noteEnv => noteEnv.map(note => note.exportType))
  );
  const moduleValueEnv =
    noteEnv.map(noteEnv => noteEnv.map(note => note.exportValue));

  const pathParsed = Path.parse(file.path);
  const jsonPath = Path.format({ ...pathParsed, base: pathParsed.name + '.json' });
  const tablePath = Path.format({ ...pathParsed, base: pathParsed.name + '.table' });
  const json = compiledFiles.flatMap(compiledFiles =>
    compiledFiles.get(jsonPath) ?? Signal.ok(undefined)
  );
  const table = compiledFiles.flatMap(compiledFiles =>
    compiledFiles.get(tablePath) ?? Signal.ok(undefined)
  );

  return Signal.join(
    ast,
    meta,
    json,
    table,
    moduleTypeEnv,
    moduleValueEnv,
  ).map(([ast, meta, json, table, moduleTypeEnv, moduleValueEnv]) => {
    // TODO(jaked) pass in these envs from above?
    let typeEnv = Render.initTypeEnv;
    let valueEnv = Render.initValueEnv(setSelected);

    if (json) {
      const dataType = json.exportType.get('mutable');
      const dataValue = json.exportValue['mutable'];
      if (dataType && dataValue) {
        typeEnv = typeEnv.set('data', dataType);
        valueEnv = valueEnv.set('data', dataValue);
      }
    }

    if (table) {
      const tableType = table.exportType.get('default');
      const tableValue = table.exportValue['default'];
      if (tableType && tableValue) {
        typeEnv = typeEnv.set('table', tableType);
        valueEnv = valueEnv.set('table', tableValue);
      }
    }

    // TODO(jaked)
    // avoid recompiling / rerendering when json / table type has not changed

    const compiled =
      compileMdx(trace, ast, meta, typeEnv, valueEnv, moduleTypeEnv, moduleValueEnv)
    return { ...compiled, ast: Try.ok(ast) }
  });
}
