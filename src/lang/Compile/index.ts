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
  return Signal.label('notes',
    Signal.mapImmutableMap(groupedFiles, noteOfGroup)
  );
}

function sortNotes(notes: data.ParsedNotesWithImports): Array<string> {
  const sortedTags: Array<string> = [];
  const remaining = new Set(notes.keys());
  let again = true;
  while (again) {
    again = false;
    remaining.forEach(tag => {
      const note = notes.get(tag);
      if (!note) throw new Error('expected note');
      if (note.imports.size === 0) {
        sortedTags.push(tag);
        remaining.delete(tag);
        again = true;
      } else {
        const imports = [...note.imports.values()];
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
  return sortedTags;
}

// dirty notes that import a dirty note (post-sorting for transitivity)
// TODO(jaked)
// don't need to re-typecheck / re-compile a note if it hasn't changed
// and its dependencies haven't changed their types
function dirtyTransitively(
  orderedTags: Array<string>,
  compiledNotes: data.CompiledNotes,
  parsedNotes: data.ParsedNotesWithImports
): data.CompiledNotes {
  const dirty = new Set<string>();
  orderedTags.forEach(tag => {
    if (!compiledNotes.has(tag)) {
      if (debug) console.log(tag + ' dirty because file changed');
      dirty.add(tag);
    }
    const note = parsedNotes.get(tag);
    if (!note) throw new Error('expected note');
    const imports = [...note.imports.values()];
    if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
    // a note importing a dirty note must be re-typechecked
    if (!dirty.has(tag) && imports.some(tag => dirty.has(tag))) {
      const dirtyTag = imports.find(tag => dirty.has(tag));
      if (debug) console.log(tag + ' dirty because ' + dirtyTag);
      dirty.add(tag);
    }
  });
  return compiledNotes.filterNot(note => dirty.has(note.tag))
}

function compileDirtyNotes(
  trace: Trace,
  orderedTags: Array<string>,
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
      const parsedNote = parsedNotes.get(tag) || bug(`expected note for ${tag}`);
      if (debug) console.log('typechecking / rendering ' + tag);

      const moduleTypeEnv = Immutable.Map<string, Type.ModuleType>().asMutable();
      const moduleValueEnv = Immutable.Map<string, any>().asMutable();
      parsedNote.imports.forEach(tag => {
        const compiledNote = compiledNotes.get(tag);
        if (compiledNote) {
          // TODO(jaked) compute this in note compile
          const moduleTypeFields: Array<{ field: string, type: Type }> = [];
          let moduleValue: { [s: string]: Signal<any> } = {};
          const mdx = compiledNote.compiled.mdx;
          if (typeof mdx !== 'undefined' && mdx.type === 'ok') {
            moduleTypeFields.push(...mdx.ok.exportType.fields);
            moduleValue = { ...moduleValue, ...mdx.ok.exportValue };
          }
          const json = compiledNote.compiled.json;
          if (typeof json !== 'undefined' && json.type === 'ok') {
            moduleTypeFields.push(...json.ok.exportType.fields);
            moduleValue = { ...moduleValue, ...json.ok.exportValue };
          }
          const table = compiledNote.compiled.table;
          if (typeof table !== 'undefined' && table.type === 'ok') {
            moduleTypeFields.push(...table.ok.exportType.fields);
            moduleValue = { ...moduleValue, ...table.ok.exportValue };
          }

          // TODO(jaked) make this easier somehow
          const moduleType =
            Type.module(
              moduleTypeFields.reduce<{ [f: string]: Type }>(
                (obj, fieldType) => {
                  const { field, type } = fieldType;
                  return { ...obj, [field]: type };
                },
                {}
              )
            );
          moduleTypeEnv.set(tag, moduleType);
          moduleValueEnv.set(tag, moduleValue);
        }
      });

      const compiledNote =
        trace.time(tag, () =>
          compileNote(
            trace,
            parsedNote,
            typeEnv,
            valueEnv,
            moduleTypeEnv.asImmutable(),
            moduleValueEnv.asImmutable(),
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
    Signal.joinImmutableMap(Signal.mapImmutableMap(
      notesSignal,
      note => note.map(note => parseNote(trace, note))
    ))
  );

  const parsedNotesWithImportsSignal = Signal.label('parseNotesWithImports',
    Signal.mapWithPrev<data.ParsedNotes, data.ParsedNotesWithImports>(
      parsedNotesSignal,
      (parsedNotes, prevParsedNotes, prevParsedNotesWithImports) =>
        prevParsedNotesWithImports.withMutations(parsedNotesWithImports => {
          const { added, changed, deleted } = diffMap(prevParsedNotes, parsedNotes);

          deleted.forEach((v, tag) => { parsedNotesWithImports.delete(tag) });
          changed.forEach(([prev, curr], tag) => {
            parsedNotesWithImports.set(tag, trace.time(tag, () => findImports(curr, parsedNotes)))
          });
          added.forEach((v, tag) => {
            parsedNotesWithImports.set(tag, trace.time(tag, () => findImports(v, parsedNotes)))
          });
        }),
      Immutable.Map(),
      Immutable.Map()
    )
  );

  // TODO(jaked)
  // maybe could do this with more fine-grained Signals
  // but it's easier to do all together
  return Signal.label('compileNotes',
    Signal.mapWithPrev(
      parsedNotesWithImportsSignal,
      (parsedNotesWithImports, prevParsedNotesWithImports, compiledNotes) => {
        const { added, changed, deleted } = diffMap(prevParsedNotesWithImports, parsedNotesWithImports);

        changed.forEach((v, tag) => { compiledNotes = compiledNotes.delete(tag) });
        deleted.forEach((v, tag) => { compiledNotes = compiledNotes.delete(tag) });

        // topologically sort notes according to imports
        const orderedTags = trace.time('sortNotes', () => sortNotes(parsedNotesWithImports));

        // dirty notes that import a dirty note (post-sorting for transitivity)
        compiledNotes = trace.time('dirtyTransitively', () => dirtyTransitively(orderedTags, compiledNotes, parsedNotesWithImports));

        // compile dirty notes (post-sorting for dependency ordering)
        compiledNotes = trace.time('compileDirtyNotes', () => compileDirtyNotes(trace, orderedTags, parsedNotesWithImports, compiledNotes, updateFile, setSelected));
        return compiledNotes;
      },
      Immutable.Map(),
      Immutable.Map()
    )
  );
}
