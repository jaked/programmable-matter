import * as Immutable from 'immutable';

import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import { diffMap } from '../../util/immutable/Map';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as Render from '../Render';
import * as data from '../../data';

import compileNote from './compileNote';
import findImports from './findImports';
import groupFilesByTag from './groupFilesByTag';
import noteOfGroup from './noteOfGroup';
import parseNote from './parseNote';

const debug = false;

export type ModuleValueEnv = Immutable.Map<string, { [s: string]: Signal<any> }>

// TODO(jaked) called from app, where should this go?
export function notesOfFiles(
  trace: Trace,
  files: Signal<data.Files>,
): Signal<data.Notes> {
  const groupedFiles =
    Signal.label('groupedFiles',
      Signal.mapWithPrev(
        files,
        groupFilesByTag,
        Immutable.Map(),
        Immutable.Map()
      )
    );
  return Signal.label('notesOfFiles',
    Signal.mapImmutableMap(groupedFiles, noteOfGroup)
  );
}

function sortNotes(noteImports: Immutable.Map<string, Immutable.Set<string>>): Immutable.List<string> {
  const sortedTags = Immutable.List<string>().asMutable();
  const remaining = new Set(noteImports.keys());
  let again = true;
  while (again) {
    again = false;
    remaining.forEach(tag => {
      const imports = noteImports.get(tag) ?? bug(`expected imports for ${tag}`);
      if (imports.size === 0) {
        sortedTags.push(tag);
        remaining.delete(tag);
        again = true;
      } else {
        if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
        if (imports.every(tag => !remaining.has(tag))) {
          if (debug) console.log('adding ' + tag + ' to order');
          sortedTags.push(tag);
          remaining.delete(tag);
          again = true;
        }
      }
    });
  }
  // any remaining notes can't be parsed, or are part of a dependency loop
  remaining.forEach(tag => {
    if (debug) console.log(tag + ' failed to parse or has a loop');
    sortedTags.push(tag)
  });
  return sortedTags.asImmutable();
}

// dirty notes that import a dirty note (post-sorting for transitivity)
// TODO(jaked)
// don't need to re-typecheck / re-compile a note if it hasn't changed
// and its dependencies haven't changed their types
function dirtyTransitively(
  orderedTags: Immutable.List<string>,
  compiledNotes: data.CompiledNotes,
  noteImports: Immutable.Map<string, Immutable.Set<string>>
): data.CompiledNotes {
  const dirty = new Set<string>();
  orderedTags.forEach(tag => {
    if (!compiledNotes.has(tag)) {
      if (debug) console.log(tag + ' dirty because file changed');
      dirty.add(tag);
    }
    const imports = noteImports.get(tag) ?? bug(`expected imports for ${tag}`);
    if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
    // a note importing a dirty note must be re-typechecked
    if (!dirty.has(tag) && imports.some(tag => dirty.has(tag))) {
      const dirtyTag = imports.find(tag => dirty.has(tag));
      if (debug) console.log(tag + ' dirty because ' + dirtyTag);
      dirty.add(tag);
      compiledNotes.delete(tag);
    }
  });
  return compiledNotes;
}

function compileDirtyNotes(
  trace: Trace,
  orderedTags: Immutable.List<string>,
  parsedNotes: data.ParsedNotesWithImports,
  compiledNotes: data.CompiledNotes,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (note: string) => void,
): data.CompiledNotes {
  const typeEnv = Render.initTypeEnv;
  const valueEnv = Render.initValueEnv(setSelected);
  orderedTags.forEach(tag => {
    const compiledNote = compiledNotes.get(tag);
    if (!compiledNote) {
      const parsedNote = parsedNotes.get(tag) ?? bug(`expected note for ${tag}`);
      if (debug) console.log('typechecking / rendering ' + tag);

      const importedModules = parsedNote.imports.map(imports => {
        const modules = Immutable.Map<string, data.CompiledNote>().asMutable();
        imports.forEach(tag => {
          const note = compiledNotes.get(tag);
          if (note) modules.set(tag, note);
        });
        return modules.asImmutable();
      });

      const moduleTypeEnv =
        Signal.joinImmutableMap(
          importedModules.map(importedModules =>
            importedModules.map(mod => mod.exportType)
          )
        );

      const moduleValueEnv =
        Signal.joinImmutableMap(
          importedModules.map(importedModules =>
            importedModules.map(mod => mod.exportValue)
          )
        );

      const compiledNote =
        trace.time(tag, () =>
          compileNote(
            trace,
            parsedNote,
            typeEnv,
            valueEnv,
            moduleTypeEnv,
            moduleValueEnv,
            updateFile,
            setSelected
          )
        );
      compiledNotes = compiledNotes.set(tag, compiledNote);
    }
  });
  return compiledNotes;
}

export function compileNotes(
  trace: Trace,
  notesSignal: Signal<data.Notes>,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (note: string) => void,
): Signal<data.CompiledNotes> {
  const parsedNotesSignal = Signal.label('parseNotes',
    Signal.mapImmutableMap(
      notesSignal,
      note => parseNote(trace, note)
    )
  );

  // TODO(jaked) consolidate with prev mapImmutableMap?
  const parsedNotesWithImportsSignal = Signal.label('parseNotesWithImports',
    Signal.mapImmutableMap(
      parsedNotesSignal,
      (v, k, parsedNotes) => findImports(v, parsedNotes)
    )
  );

  const noteImportsSignal = Signal.label('noteImports',
    Signal.joinImmutableMap(
      Signal.mapImmutableMap(
        parsedNotesWithImportsSignal,
        note => note.imports
      )
    )
  );

  // TODO(jaked)
  // maybe could do this with more fine-grained Signals
  // but it's easier to do all together
  return Signal.label('compileNotes',
    Signal.mapWithPrev<[data.ParsedNotesWithImports, Immutable.Map<string, Immutable.Set<string>>], data.CompiledNotes>(
      Signal.join(parsedNotesWithImportsSignal, noteImportsSignal),
      ([parsedNotes, imports], [prevParsedNotes, prevImports], prevCompiledNotes) => {
        const compiledNotes = prevCompiledNotes.asMutable();
        const parsedNotesDiff = diffMap(prevParsedNotes, parsedNotes);
        const importsDiff = diffMap(prevImports, imports);

        parsedNotesDiff.deleted.forEach((v, tag) => compiledNotes.delete(tag));
        parsedNotesDiff.changed.forEach((v, tag) => compiledNotes.delete(tag));
        importsDiff.deleted.forEach((v, tag) => compiledNotes.delete(tag));
        importsDiff.changed.forEach((v, tag) => compiledNotes.delete(tag));

        // topologically sort notes according to imports
        const orderedTags = trace.time('sortNotes', () => sortNotes(imports));

        // dirty notes that import a dirty note (post-sorting for transitivity)
        trace.time('dirtyTransitively', () => dirtyTransitively(orderedTags, compiledNotes, imports));

        // compile dirty notes (post-sorting for dependency ordering)
        trace.time('compileDirtyNotes', () => compileDirtyNotes(trace, orderedTags, parsedNotes, compiledNotes, updateFile, setSelected));
        return compiledNotes.asImmutable();
      },
      [Immutable.Map(), Immutable.Map()],
      Immutable.Map()
    )
  );
}
