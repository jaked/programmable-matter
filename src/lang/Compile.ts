import * as Try from '../util/Try';
import * as data from '../data';
import * as MDXHAST from './mdxhast';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';
import * as Render from './Render';

function findImports(ast: MDXHAST.Node, imports: Set<string>) {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child => findImports(child, imports));

    case 'text':
    case 'jsx':
    case 'export':
      return;

    case 'import':
      if (ast.importDeclaration) {
        imports.add(ast.importDeclaration.source.value);
      } else {
        throw 'expected import node to be parsed';
      }

    default: throw 'unexpected AST ' + (ast as MDXHAST.Node).type;
  }
}

export function compileNotes(oldNotes: data.Notes, newNotes: data.Notes): data.Notes {
  // TODO(jaked)
  // maybe we should propagate a change set
  // instead of the current state of the filesystem
  oldNotes =
    oldNotes.filter(note => newNotes.has(note.tag));

  let env = Render.initEnv;
  return newNotes.map((note, tag) => {
    const currNote = oldNotes.get(tag);
    if (!currNote || note.version > currNote.version) {
      const ast = Try.apply(() => Parser.parse(note.content));
      const imports = Try.map(ast, ast => {
        const imports = new Set<string>();
        findImports(ast, imports);
        return imports;
      });
      // TODO(jaked)
      // environment should include identifiers in other pages
      const exports = Try.map(ast, ast => {
        const exports: { [s: string]: Type.Type } = {};
        Typecheck.checkMdx(ast, env, exports);
        return Type.object(exports);
      });
      const compiledAst =
        Try.joinMap(ast, exports, (ast, exports) => ast);
      const compiled: data.Compiled = { ast, imports, exports, compiledAst };
      return Object.assign({}, note, { compiled });
    } else {
      return currNote;
    }
  });
}
