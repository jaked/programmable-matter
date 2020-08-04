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
      searchCell,
    ).flatMap(([notes, search]) => {
      let matchingNotes: Signal<data.CompiledNotes>;
      if (search) {
        // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
        const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        const regexp = RegExp(escaped, 'i');

        function matchesSearch(note: data.CompiledNote): Signal<[boolean, data.CompiledNote]> {
          return Signal.label(note.name,
            Signal.join(
              note.files.mdx ? note.files.mdx.content.map(mdx => regexp.test(mdx)) : Signal.ok(false),
              note.files.json ? note.files.json.content.map(json => regexp.test(json)) : Signal.ok(false),
              note.meta.map(meta => !!(meta.tags && meta.tags.some(tag => regexp.test(tag)))),
              Signal.ok(regexp.test(note.name)),
            ).map(bools => [bools.some(bool => bool), note])
          );
        }
        // TODO(jaked) wrap this up in a function on Signal
        matchingNotes = Signal.label('matches',
          Signal.joinImmutableMap(Signal.ok(notes.map(matchesSearch)))
            .map(map => map.filter(([bool, note]) => bool).map(([bool, note]) => note)
          )
        );
      } else {
        matchingNotes = Signal.ok(notes);
      }

      return Signal.label('sort',
        matchingNotes.map(matchingNotes => matchingNotes.valueSeq().toArray().sort((a, b) =>
          a.name < b.name ? -1 : 1
        ))
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
      focusEditor={props.focusEditor}
    />
  </>);
}));

export default Sidebar;
