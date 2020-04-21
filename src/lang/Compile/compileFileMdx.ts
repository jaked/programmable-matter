import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import * as Parse from '../Parse';
import * as Render from '../Render';
import * as MDXHAST from '../mdxhast';
import * as data from '../../data';

import compileMdx from './compileMdx';

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
): Signal<data.CompiledFile> {
  const ast = file.content.map(content => Parse.parse(trace, content));
  const imports = ast.map(findImports);
  // TODO(jaked) support layouts
  // TODO(jaked) support refs to data / table parts

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

  // TODO(jaked) pass in these envs from above?
  const typeEnv = Render.initTypeEnv;
  // TODO(jaked) setSelected
  const valueEnv = Render.initValueEnv((note: string) => {});

  // handle .meta file
  return Signal.join(ast, moduleTypeEnv, moduleValueEnv).map(([ast, moduleTypeEnv, moduleValueEnv]) => {
    const compiled = compileMdx(trace, ast, {}, typeEnv, valueEnv, moduleTypeEnv, moduleValueEnv)
    return { ...compiled, ast: Try.ok(ast) }
  });
}
