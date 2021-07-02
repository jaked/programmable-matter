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

  return (<>
    <SearchBox
      ref={searchBoxRef}
      focusNotes={focusNotes}
      focusEditor={props.focusEditor}
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
