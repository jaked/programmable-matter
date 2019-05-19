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

export function compileNotes(
  oldNotes: data.Notes,
  newNotes: data.Notes,
  lets: Atom<Immutable.Map<string, any>>
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
      const exportType = Try.failure(null);
      const exportValue = Try.failure(null);
      const rendered = Try.failure(null);
      const compiled: data.Compiled =
        { ast, imports, exportType, exportValue, rendered };
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

  let typeEnv = Render.initEnv;
  orderedTags.forEach(tag => {
    const note = newNotes.get(tag);
    if (!note || !note.compiled) throw 'expected note && note.compiled';

    if (dirty.has(tag)) {
      const exportType = Try.map(note.compiled.ast, ast => {
        const exportTypes: { [s: string]: Type.Type } = {};
        Typecheck.checkMdx(ast, typeEnv, exportTypes);
        const type = Type.object(exportTypes);
        // TODO(jaked) build per-note env with specific imports
        typeEnv = typeEnv.set(String.capitalize(tag), type);
        return type;
      });
      const compiled = Object.assign({}, note.compiled, { exportType });
      const note2 = Object.assign({}, note, { compiled });
      newNotes = newNotes.set(tag, note2);
    } else {
      Try.forEach(note.compiled.exportType, exportType => {
        typeEnv = typeEnv.set(String.capitalize(tag), exportType);
      });
    }
  });

  // TODO(jaked) merge with previous loop
  let valueEnv: Render.Env = Immutable.Map();
  orderedTags.forEach(tag => {
    const note = newNotes.get(tag);
    if (!note || !note.compiled) throw 'expected note && note.compiled';

    if (dirty.has(tag)) {
      const exportValuesRendered = Try.map(note.compiled.ast, ast => {
        const exportValues: { [s: string]: any } = {};
        const rendered = Render.renderMdx(ast, valueEnv, lets, exportValues);
        // TODO(jaked) build per-note env with specific imports
        valueEnv = valueEnv.set(String.capitalize(tag), exportValues);
        return [exportValues, rendered];
      });
      const exportValue = Try.map(exportValuesRendered, ([ev, _]) => ev);
      const rendered = Try.map(exportValuesRendered, ([_, r]) => r);
      const compiled =
        Object.assign({}, note.compiled, { exportValue, rendered });
      const note2 = Object.assign({}, note, { compiled });
      newNotes = newNotes.set(tag, note2);
    } else {
      Try.forEach(note.compiled.exportValue, exportValue => {
        valueEnv = valueEnv.set(String.capitalize(tag), exportValue);
      });
    }
  })

  return newNotes;
}
