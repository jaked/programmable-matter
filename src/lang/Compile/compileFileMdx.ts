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
import sortMdx from './sortMdx';
import * as data from '../../data';

import metaForPath from './metaForPath';

const debug = false;

function findImports(ast: MDXHAST.Node) {
  const imports = Immutable.Set<string>().asMutable();
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

export default function compileFileMdx(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  compiledNotes: Signal<data.CompiledNotes>,
  setSelected: (note: string) => void,
): Signal<data.CompiledFile> {
  // TODO(jaked) handle parse errors
  const ast = file.content.map(content =>
    sortMdx(Parse.parse(trace, content))
  );

  const meta = metaForPath(file.path, compiledFiles);
  const imports = ast.map(ast => findImports(ast));

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

  const jsonType = compiledFiles.flatMap(compiledFiles => {
    const json = compiledFiles.get(jsonPath);
    if (json) return json.map(json => json.exportType.getFieldType('mutable'));
    else return Signal.ok(undefined);
  });
  const jsonValue = compiledFiles.flatMap(compiledFiles => {
    const json = compiledFiles.get(jsonPath);
    if (json) return json.flatMap(json => json.exportValue['mutable'] ?? Signal.ok(undefined));
    else return Signal.ok(undefined);
  });
  const tableType = compiledFiles.flatMap(compiledFiles => {
    const table = compiledFiles.get(tablePath);
    if (table) return table.map(table => table.exportType.getFieldType('default'));
    else return Signal.ok(undefined);
  });
  const tableValue = compiledFiles.flatMap(compiledFiles => {
    const table = compiledFiles.get(tablePath);
    if (table) return table.flatMap(table => table.exportValue['default'] ?? Signal.ok(undefined));
    else return Signal.ok(undefined);
  });

  const typecheck = Signal.label("typecheck", Signal.join(
    Signal.label("ast", ast),
    Signal.label("jsonType", jsonType),
    Signal.label("tableType", tableType),
    Signal.label("moduleTypeEnv", moduleTypeEnv),
  ).map(([ast, jsonType, tableType, moduleTypeEnv]) => {
    // TODO(jaked) pass in these envs from above?
    let typeEnv = Render.initTypeEnv;

    if (jsonType) typeEnv = typeEnv.set('data', jsonType);
    if (tableType) typeEnv = typeEnv.set('table', tableType);

    const exportTypes: { [s: string]: Type.Type } = {};
    const astAnnotations = new Map<unknown, Type>();
    trace.time('synthMdx', () => Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes, astAnnotations));
    const problems = [...astAnnotations.values()].some(t => t.kind === 'Error');
    const exportType = Type.module(exportTypes);
    return { exportType, astAnnotations, problems }
  }));

  const layoutFunction = Signal.label("layoutFunction", Signal.join(
    Signal.label("meta", meta),
    Signal.label("compiledNotes", compiledNotes),
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
  }));

  const render = Signal.label("render", Signal.join(
    Signal.label("ast", ast),
    Signal.label("typecheck", typecheck),
    Signal.label("jsonValue", jsonValue),
    Signal.label("tableValue", tableValue),
    Signal.label("moduleValueEnv", moduleValueEnv),
  ).map(([ast, typecheck, jsonValue, tableValue, moduleValueEnv]) => {
    // TODO(jaked) pass in these envs from above?
    let valueEnv = Render.initValueEnv(setSelected);

    if (jsonValue) valueEnv = valueEnv.set('data', Signal.ok(jsonValue));
    if (tableValue) valueEnv = valueEnv.set('table', Signal.ok(tableValue));

    // TODO(jaked) clean up mess with errors
    try {
      const exportValue: { [s: string]: Signal<any> } = {};
      const rendered =
        trace.time('renderMdx', () => {
          const [_, node] = Render.renderMdx(ast, typecheck.astAnnotations, moduleValueEnv, valueEnv, exportValue);
          return node;
        });

      return { exportValue, rendered };
    } catch (e) {
      return { exportValue: {}, rendered: Signal.err(e) };
    }
  }));

  return Signal.join(ast, typecheck).flatMap(([ast, typecheck]) =>
      render.map(render => ({
        exportType: typecheck.exportType,
        exportValue: render.exportValue,
        rendered:
          Signal.join(render.rendered, meta, layoutFunction).map(([rendered, meta, layoutFunction]) =>
            layoutFunction ? layoutFunction({ children: rendered, meta }) : rendered
          ),
        astAnnotations: typecheck.astAnnotations,
        problems: typecheck.problems,
        ast: Try.ok(ast),
      }))
  );
}
