import * as Path from 'path';
import { bug } from '../../util/bug';
import * as MDXHAST from '../mdxhast';
import * as data from '../../data';

function findImportsMdx(ast: MDXHAST.Node, imports: Set<string>) {
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
  let imports = new Set<string>();
  // TODO(jaked) separate imports for note components
  Object.keys(note.parsed).forEach(key => {
    switch (key) {
      case 'mdx': {
        // TODO(jaked) fix layout != tag hack
        // layouts shouldn't themselves have layouts
        // but we don't know here that we are defining a layout
        // and a directory-level .meta file can give a layout a layout
        if (note.meta.layout && note.meta.layout != note.tag)
          imports.add(note.meta.layout);
        const ast = note.parsed.mdx ?? bug(`expected parsed mdx`);
        ast.forEach(ast => findImportsMdx(ast, imports));
      }
      break;

      case 'table': {
        const dir = note.tag;
        const thisNote = note;
        notes.forEach(note => {
          // TODO(jaked) not sure if we should handle nested dirs in tables
          if (!Path.relative(dir, note.tag).startsWith('..') && note !== thisNote)
            imports.add(note.tag);
        });
      }
      break;
    }
  });
  return { ...note, imports };
}
