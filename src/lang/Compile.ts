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
  const dirty = new Set<string>();

  // TODO(jaked)
  // maybe we should propagate a change set
  // instead of the current state of the filesystem

  oldNotes = oldNotes.filter(note => {
    if (!newNotes.has(note.tag)) {
      // mark deleted notes dirty so dependents are rebuilt
      dirty.add(note.tag);
      return false;
    } else {
      return true;
    }
  });

  newNotes = newNotes.map((note, tag) => {
    const oldNote = oldNotes.get(tag);
    if (oldNote && oldNote.version == note.version) {
      return oldNote;
    } else {
      dirty.add(tag);
      return note;
    }
  });

  newNotes = newNotes.map((note, tag) => {
    if (dirty.has(tag)) {
      const ast = Try.apply(() => Parser.parse(note.content));
      const imports = Try.map(ast, ast => {
        const imports = new Set<string>();
        findImports(ast, imports);
        return imports;
      });
      // placeholders
      const exports = Try.failure(null);
      const compiledAst = Try.failure(null);
      const compiled = { ast, imports, exports, compiledAst };
      return Object.assign({}, note, { compiled });
    } else {
      return note;
    }
  });

  // topologically sort notes according to imports
  const orderedTags: Array<string> = [];
  const notes = new Set(newNotes.keys());
  let again = true;
  while (again) {
    again = false;
    notes.forEach(tag => {
      const note = newNotes.get(tag);
      if (!note || !note.compiled) throw 'expected note && note.compiled';
      if (note.compiled.imports.type === 'success') {
        const imports = [...note.compiled.imports.success.values()];
        if (imports.every(tag => orderedTags.includes(tag))) {
          if (imports.some(tag => dirty.has(tag)))
            dirty.add(tag);
          orderedTags.push(tag);
          notes.delete(tag);
          again = true;
        }
      }
    });
  }
  // any remaining notes can't be parsed, or are part of a dependency loop
  notes.forEach(tag => orderedTags.push(tag));

  let env = Render.initEnv;
  orderedTags.forEach(tag => {
    const note = newNotes.get(tag);
    if (!note || !note.compiled) throw 'expected note && note.compiled';

    if (dirty.has(tag)) {
      const exports = Try.map(note.compiled.ast, ast => {
        const exports: { [s: string]: Type.Type } = {};
        Typecheck.checkMdx(ast, env, exports);
        const type = Type.object(exports);
        // TODO(jaked) build per-note env from specific imports
        env = env.set(tag.toUpperCase(), type);
        return type;
      });
      const compiledAst =
        Try.joinMap(note.compiled.ast, exports, (ast, exports) => ast);
      const compiled = Object.assign({}, note.compiled, { exports, compiledAst });
      const note2 = Object.assign({}, note, { compiled });
      newNotes = newNotes.set(tag, note2);
    } else {
      Try.forEach(note.compiled.exports, exports => {
        env = env.set(tag.toUpperCase(), exports);
      });
    }
  });

  return newNotes;
}
