import * as Immutable from 'immutable';

import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import { diffMap } from '../../util/immutable/Map';
import { bug } from '../../util/bug';
import * as Render from '../Render';
import * as data from '../../data';

import compileFile from './compileFile';
import compileNote from './compileNote';
import findImports from './findImports';
import groupFilesByTag from './groupFilesByTag';
import noteTagsOfFiles from './noteTagsOfFiles';
import noteOfGroup from './noteOfGroup';
import parseNote from './parseNote';

const debug = false;

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

      const noteEnv = parsedNote.imports.map(imports => {
        const modules = Immutable.Map<string, data.CompiledNote>().asMutable();
        imports.forEach(tag => {
          const note = compiledNotes.get(tag);
          if (note) modules.set(tag, note);
        });
        return modules.asImmutable();
      });

      const compiledNote =
        trace.time(tag, () =>
          compileNote(
            trace,
            parsedNote,
            typeEnv,
            valueEnv,
            noteEnv,
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

const unimplementedSignal = Signal.err(new Error('unimplemented'));

export function compileFiles(
  trace: Trace,
  files: Signal<data.Files>
): Signal<data.CompiledNotes> {

  // TODO(jaked)
  // * map a file compilation function over files
  // * collect note list from file list, map a note compilation function over notes
  // * these compilations are lazy, demanded at the top level by mainSignal
  // * compilation functions refer to other files / notes via Signal ref
  //   - Signal ref can be set after creation, maintain increasing version
  //   - Signal loop breaker to avoid infinite loop

  const noteTags = noteTagsOfFiles(files);

  const compiledFilesRef = Signal.ref<Immutable.Map<string, Signal<data.Compiled>>>();

  const compiledNotesRef = Signal.ref<data.CompiledNotes>();

  const compiledFiles = Signal.mapImmutableMap(files, file =>
    compileFile(trace, file, compiledFilesRef, compiledNotesRef)
  );
  compiledFilesRef.set(compiledFiles);

  const compiledNotes: Signal<data.CompiledNotes> = Signal.mapImmutableMap(noteTags, (paths, tag) => {
    // TODO(jaked) fix temporary hacks
    if (paths.size !== 1) bug(`expected 1 path for '${tag}'`);
    const compiled = compiledFiles.flatMap(compiledFiles => {
      const path = paths.find(path => true);
      if (!path) bug(`expected path for '${tag}`);
      const compiled = compiledFiles.get(path);
      if (!compiled) bug(`expected compiled file for '${path}'`);
      return compiled;
    });
    return {
      tag,
      isIndex: false,
      meta: unimplementedSignal,
      files: { },
      parsed: { mdx: compiled.map(compiled => compiled.ast) },
      imports: unimplementedSignal,
      compiled: { mdx: compiled },
      problems: compiled.map(compiled => compiled.problems),
      rendered: compiled.flatMap(compiled => compiled.rendered),
      exportType: compiled.map(compiled => compiled.exportType),
      exportValue: compiled.map(compiled => compiled.exportValue),
    };
  });
  compiledNotesRef.set(compiledNotes);

  return compiledNotes;
}
