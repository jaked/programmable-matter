import React from 'react';

import Signal from '../../util/Signal';

import Notes from './Notes';
import SearchBox from './SearchBox';
import * as data from '../../data';

type Props = {
  render: () => void;
  compiledNotes: Signal<data.CompiledNotes>;
  selected: Signal<string | null>;
  setSelected: (s: string | null) => void;
  maybeSetSelected: (s: string) => boolean;
  onNewNote: Signal<(s: string) => void>;
  focusEditor: () => void;
}

type Sidebar = {
  focusSearchBox: () => void;
  focusNotes: () => void;
}

const Sidebar = React.memo(React.forwardRef<Sidebar, Props>((props, ref) => {
  const notesRef = React.useRef<HTMLDivElement>(null);
  const searchBoxRef = React.useRef<SearchBox>(null);

  const focusSearchBox =
    () => searchBoxRef.current && searchBoxRef.current.focus();
  const focusNotes =
    () => notesRef.current && notesRef.current.focus();
  React.useImperativeHandle(ref, () => ({
    focusSearchBox,
    focusNotes,
  }));

  const focusDirCell = Signal.cellOk<string | null>(null, props.render);
  const setFocusDir = (focus: string | null) => {
    focusDirCell.setOk(focus);
  }

  const searchCell = Signal.cellOk<string>('', props.render);
  const setSearch = (search: string) => {
    searchCell.setOk(search);
  }

  const matchingNotesSignal = Signal.label('matchingNotes',
    Signal.join(
      // TODO(jaked)
      // map matching function over individual note signals
      // so we only need to re-match notes that have changed
      props.compiledNotes,
      focusDirCell,
      searchCell,
    ).flatMap(([notes, focusDir, search]) => {
      // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
      const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const regexp = RegExp(escaped, 'i');

      // TODO(jaked) match on source files not compiled note
      function matchesSearch(note: data.CompiledNote): Signal<{
        matches: boolean,
        mtimeMs: number,
        note: data.CompiledNote
      }> {
        const matches =
          focusDir && !note.name.startsWith(focusDir + '/') ? Signal.ok(false) :
          search ? Signal.join(
            note.files.mdx ? note.files.mdx.content.map(mdx => regexp.test(mdx)) : Signal.ok(false),
            note.files.json ? note.files.json.content.map(json => regexp.test(json)) : Signal.ok(false),
            note.meta.map(meta => !!(meta.tags && meta.tags.some(tag => regexp.test(tag)))),
            Signal.ok(regexp.test(note.name)),
          ).map(bools => bools.some(bool => bool)) :
          Signal.ok(true);
        const mtimeMs = Signal.join(
          note.files.mdx ? note.files.mdx.mtimeMs : Signal.ok(0),
          note.files.json ? note.files.json.mtimeMs : Signal.ok(0),
          note.files.meta ? note.files.meta.mtimeMs : Signal.ok(0),
        ).map(mtimeMss => Math.max(...mtimeMss));

        return Signal.label(`match ${note.name}`,
          Signal.join(matches, mtimeMs)
          .map(([matches, mtimeMs]) => ({ matches, note, mtimeMs }))
        );
      }

      // TODO(jaked) wrap this up in a function on Signal
      const matchingNotes = Signal.label('matches',
        Signal.joinImmutableMap(Signal.ok(notes.map(matchesSearch)))
          .map(map => map.filter(({ matches }) => matches))
      );

      return Signal.label('sort',
        matchingNotes.map(matchingNotes =>
          matchingNotes.valueSeq().toArray()
            .sort((a, b) => a.mtimeMs > b.mtimeMs ? -1 : 1 )
            .map(({ note }) => note)
        )
      );
    })
  );

  const onKeyDown = Signal.join(
    searchCell,
    matchingNotesSignal,
    props.onNewNote,
  ).map(([search, matchingNotes, onNewNote]) =>
    (e: React.KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;

      switch (e.key) {
        case 'ArrowUp':
          focusNotes();
          props.setSelected(matchingNotes[matchingNotes.length - 1].name);
          e.preventDefault();
          break;

        case 'ArrowDown':
          focusNotes();
          props.setSelected(matchingNotes[0].name);
          e.preventDefault();
          break;

        case 'Enter':
          if (props.maybeSetSelected(search)) {
            props.focusEditor();
          } else {
            onNewNote(search);
          }
          e.preventDefault();
          break;
      }
    }
  );

  return (<>
    <SearchBox
      ref={searchBoxRef}
      focusDir={focusDirCell}
      setFocusDir={setFocusDir}
      search={searchCell}
      onSearch={setSearch}
      onKeyDown={onKeyDown}
      onNewNote={props.onNewNote}
    />
    <Notes
      ref={notesRef}
      notes={matchingNotesSignal}
      selected={props.selected}
      onSelect={props.setSelected}
      focusDir={focusDirCell}
      onFocusDir={setFocusDir}
      focusEditor={props.focusEditor}
    />
  </>);
}));

export default Sidebar;
