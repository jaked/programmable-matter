import * as Immutable from 'immutable';
import { Atom } from '@grammarly/focal';
import * as Try from '../util/Try';
import * as data from '../data';
import * as MDXHAST from './mdxhast';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';
import * as Render from './Render';
import * as String from '../util/String';

const debug = false;

function findImports(ast: MDXHAST.Node, imports: Set<string>) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => findImports(child, imports));

    case 'text':
    case 'jsx':
      break;

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      Try.forEach(ast.declarations, decls => decls.forEach(decl => {
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

export function compileNotes(
  oldNotes: data.Notes,
  newNotes: data.Notes,
  lets: Atom<Immutable.Map<string, Immutable.Map<string, any>>>
): data.Notes {
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
      if (debug) console.log(tag + ' dirty because file changed')
      dirty.add(tag);
      return note;
    }
  });

  newNotes = newNotes.map((note, tag) => {
    if (dirty.has(tag)) {
      let parsed: Try.Try<data.Parsed>;
      try {
        const ast = Parser.parse(note.content);
        const imports = new Set<string>();
        findImports(ast, imports);
        parsed = Try.success({ ast, imports });
      } catch (e) {
        parsed = Try.failure(e);
      }
      return Object.assign({}, note, { parsed });
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
      if (!note || !note.parsed) throw new Error('expected note && note.parsed');
      if (note.parsed.type === 'success') {
        const imports = [...note.parsed.success.imports.values()];
        if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
        // a note importing a dirty note must be re-typechecked
        if (!dirty.has(tag) && imports.some(tag => dirty.has(tag))) {
          const dirtyTag = imports.find(tag => dirty.has(tag));
          if (debug) console.log(tag + ' dirty because ' + dirtyTag);
          dirty.add(tag);
        }
        if (imports.every(tag => orderedTags.includes(tag))) {
          if (debug) console.log('adding ' + tag + ' to order');
          orderedTags.push(tag);
          notes.delete(tag);
          again = true;
        }
      } else {
        if (debug) console.log('no imports parsed for ' + tag);
        if (debug) console.log(note.parsed.failure);
      }
    });
  }
  // any remaining notes can't be parsed, or are part of a dependency loop
  notes.forEach(tag => {
    if (debug) console.log(tag + ' failed to parse or has a loop');
    orderedTags.push(tag)
  });

  let typeEnv = Render.initEnv;
  let valueEnv: Render.Env = Immutable.Map();
  orderedTags.forEach(tag => {
    const capitalizedTag = String.capitalize(tag);
    const note = newNotes.get(tag);
    if (dirty.has(tag)) {
      if (debug) console.log('typechecking / rendering' + tag);
      if (!note || !note.parsed) throw new Error('expected note && note.parsed');
      let compiled: Try.Try<data.Compiled>;
      try {
        // TODO(jaked) build per-note envs with specific imports
        const ast = Try.get(note.parsed).ast;
        const exportTypes: { [s: string]: [Type.Type, boolean] } = {};
        const exportValue: { [s: string]: any } = {};
        Typecheck.checkMdx(ast, typeEnv, exportTypes);
        const exportType = Type.module(exportTypes);
        typeEnv = typeEnv.set(capitalizedTag, [exportType, false]);
        const rendered = Render.renderMdx(ast, capitalizedTag, valueEnv, lets, exportValue);
        valueEnv = valueEnv.set(capitalizedTag, exportValue);
        compiled = Try.success({ exportType, exportValue, rendered });
      } catch (e) {
        compiled = Try.failure(e);
      }
      const note2 = Object.assign({}, note, { compiled });
      newNotes = newNotes.set(tag, note2);
    } else {
      if (debug) console.log('adding type / value env for ' + tag);
      if (!note || !note.compiled) throw new Error('expected note && note.compiled');
      Try.forEach(note.compiled, compiled => {
        typeEnv = typeEnv.set(capitalizedTag, [compiled.exportType, false]);
        valueEnv = valueEnv.set(capitalizedTag, compiled.exportValue);
      });
    }
  });

  return newNotes;
}
