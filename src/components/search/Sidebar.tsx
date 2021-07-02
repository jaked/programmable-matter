import React from 'react';

import Signal from '../../util/Signal';

import Notes from './Notes';
import SearchBox from './SearchBox';
import * as model from '../../model';

import * as AppSidebar from '../../app/sidebar';

type Props = {
  compiledNotes: Signal<model.CompiledNotes>;
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

  const onKeyDown = Signal.join(
    AppSidebar.searchCell,
    AppSidebar.matchingNotesSignal,
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
      focusDir={AppSidebar.focusDirCell}
      setFocusDir={AppSidebar.setFocusDir}
      search={AppSidebar.searchCell}
      onSearch={AppSidebar.setSearch}
      onKeyDown={onKeyDown}
      onNewNote={props.onNewNote}
    />
    <Notes
      ref={notesRef}
      notes={AppSidebar.matchingNotesSignal}
      selected={props.selected}
      onSelect={props.setSelected}
      focusDir={AppSidebar.focusDirCell}
      onFocusDir={AppSidebar.setFocusDir}
      focusEditor={props.focusEditor}
    />
  </>);
}));

export default Sidebar;
