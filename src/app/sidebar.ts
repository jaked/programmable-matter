import { createEditor, Editor } from 'slate';
import Signal from '../util/Signal';
import * as MapFuncs from '../util/MapFuncs';
import * as model from '../model';
import * as Compiled from '../app/compiled';

export const focusDirCell = Signal.cellOk<string | null>(null);
export const setFocusDir = (focus: string | null) => {
  focusDirCell.setOk(focus);
}

export const searchCell = Signal.cellOk<string>('');
export const setSearch = (search: string) => {
  searchCell.setOk(search);
}

const notesStrings = Signal.mapMap(Compiled.compiledNotesSignal, note => {
  const strings: Signal<string>[] = []
  strings.push(Signal.ok(note.name));
  // TODO(jaked) put back tag search
  // strings.push(note.meta.map(meta => meta.tags ?? ''));
  if (note.files.pm) {
    strings.push(note.files.pm.content.map(pmContent => {
      const editor = createEditor();
      editor.children = (pmContent as model.PMContent).children;
      return Editor.string(editor, []);
    }));
  }
  if (note.files.json) {
    strings.push(note.files.json.content as Signal<string>);
  }
  return { note, strings };
})

export const matchingNotesSignal = Signal.label('matchingNotes',
  Signal.join(
    focusDirCell,
    searchCell,
  ).flatMap(([focusDir, search]) => {
    // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regexp = RegExp(escaped, 'i');

    // TODO(jaked) match on source files not compiled note
    function matchesSearch(
      noteStrings: { note: model.CompiledNote, strings: Signal<string>[] }
    ): Signal<{
      matches: boolean,
      mtimeMs: number,
      note: model.CompiledNote
    }> {
      const { note, strings } = noteStrings;
      const matches =
        focusDir && !note.name.startsWith(focusDir + '/') ? Signal.ok(false) :
        !search ? Signal.ok(true) :
        Signal.join(
          ...strings.map(string => string.map(string => regexp.test(string)))
        ).map(bools => bools.some(bool => bool));
      const mtimeMs = Signal.join(
        note.files.pm ? note.files.pm.mtimeMs : Signal.ok(0),
        note.files.json ? note.files.json.mtimeMs : Signal.ok(0),
        note.files.meta ? note.files.meta.mtimeMs : Signal.ok(0),
      ).map(mtimeMss => Math.max(...mtimeMss));

      return Signal.join(matches, mtimeMs)
        .map(([matches, mtimeMs]) => ({ matches, note, mtimeMs }));
    }

    // TODO(jaked) wrap this up in a function on Signal
    const matchingNotes = Signal.label('matches',
      Signal.joinMap(Signal.mapMap(notesStrings, matchesSearch))
        .map(map => MapFuncs.filter(map, ({ matches }) => matches))
    );

    return Signal.label('sort',
      matchingNotes.map(matchingNotes =>
        [...matchingNotes.values()]
          .sort((a, b) => a.mtimeMs > b.mtimeMs ? -1 : 1 )
          .map(({ note }) => note)
      )
    );
  })
);
