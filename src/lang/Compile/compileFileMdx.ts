import Path from 'path';
import * as Immutable from 'immutable';
import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import { bug } from '../../util/bug';
import * as Parse from '../Parse';
import * as Render from '../Render';
import * as MDXHAST from '../mdxhast';
import Type from '../Type';
import Typecheck from '../Typecheck';
import { Content, CompiledFile, CompiledNote, CompiledNotes } from '../../data';

import makeLink from '../../components/makeLink';
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
  file: Content,
  compiledFiles: Signal<Immutable.Map<string, CompiledFile>>,
  compiledNotes: Signal<CompiledNotes>,
  setSelected: (note: string) => void,
): CompiledFile {
  const moduleName = Name.nameOfPath(file.path);

  // TODO(jaked) handle parse errors
  const ast = file.content.map(content =>
    Parse.parse(content as string)
  );

  const meta = metaForPath(file.path, compiledFiles);
  const imports = ast.map(ast => findImports(ast));

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
    Typecheck.synthMdx(moduleName, ast, moduleTypeEnv, typeEnv, exportTypes, astAnnotations);
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
    const Link = makeLink(moduleName, setSelected);

    if (jsonValue) valueEnv = valueEnv.set('data', Signal.ok(jsonValue));
    if (tableValue) valueEnv = valueEnv.set('table', Signal.ok(tableValue));

    // TODO(jaked) clean up mess with errors
    try {
      const exportValue: { [s: string]: Signal<any> } = {};
      const [_, rendered] = Render.renderMdx(ast, typecheck.astAnnotations, moduleName, moduleValueEnv, valueEnv, exportValue, Link);

      return { exportValue, rendered };
    } catch (e) {
      return { exportValue: {}, rendered: Signal.err(e) };
    }
  }));

  const rendered = Signal.join(render, meta, layoutFunction).flatMap(([render, meta, layoutFunction]) =>
    render.rendered.map(rendered =>
      layoutFunction ?
        layoutFunction({ children: rendered, meta }) :
        rendered
    )
  );

  return {
    ast,
    exportType: typecheck.map(({ exportType }) => exportType),
    astAnnotations: typecheck.map(({ astAnnotations }) => astAnnotations),
    problems: typecheck.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: render.map(({ exportValue }) => exportValue),
    rendered
  };
}
