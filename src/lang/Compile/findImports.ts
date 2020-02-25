import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import { bug } from '../../util/bug';
import * as MDXHAST from '../mdxhast';
import * as data from '../../data';

function findImportsMdx(ast: MDXHAST.Node, imports: Immutable.Set<string>) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => findImportsMdx(child, imports));

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

export default function findImports(
  note: data.ParsedNote,
  notes: data.ParsedNotes
): data.ParsedNoteWithImports {
  let imports = Signal.ok(Immutable.Set<string>());
  // TODO(jaked) separate imports for note components
  Object.keys(note.parsed).forEach(key => {
    switch (key) {
      case 'mdx': {
        const mdx = note.parsed.mdx ?? bug(`expected parsed mdx`);
        imports = Signal.join(note.meta, mdx).map(([meta, mdx]) => {
          // TODO(jaked) fix layout != tag hack
          // layouts shouldn't themselves have layouts
          // but we don't know here that we are defining a layout
          // and a directory-level .meta file can give a layout a layout
          const importsSet = Immutable.Set<string>().asMutable();
          if (meta.layout && meta.layout != note.tag)
            importsSet.add(meta.layout);
          findImportsMdx(mdx, importsSet);
          return importsSet.asImmutable();
        });
      }
      break;

      case 'table': {
        const importsSet = Immutable.Set<string>().asMutable();
        const dir = note.tag;
        const thisNote = note;
        notes.forEach(note => {
          // TODO(jaked) not sure if we should handle nested dirs in tables
          if (!Path.relative(dir, note.tag).startsWith('..') && note !== thisNote)
            importsSet.add(note.tag);
        });
        imports = Signal.ok(importsSet.asImmutable());
      }
      break;
    }
  });
  return { ...note, imports };
}
