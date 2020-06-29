import React from 'react';
import { Flex as BaseFlex } from 'rebass';
import styled from 'styled-components';

import { Notes } from './Notes';
import { SearchBox } from './SearchBox';
import * as data from '../data';

type Props = {
  focusDir: string | null;
  onFocusDir: (s: string | null) => void;
  search: string;
  onSearch: (s: string) => void;
  matchingNotes: Array<data.CompiledNote & { indent: number, expanded?: boolean }>;
  selected: string | null;
  onSelect: (s: string | null) => void;
  newNote: (s: string) => void;
  focusEditor: () => void;
  toggleDirExpanded: (s: string) => void;
}

const Flex = styled(BaseFlex)`
  :hover {
    cursor: pointer;
  }
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

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

  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return false;

    switch (e.key) {
      case 'ArrowUp':
        focusNotes();
        props.onSelect(props.matchingNotes[props.matchingNotes.length - 1].tag);
        return true;

      case 'ArrowDown':
        focusNotes();
        props.onSelect(props.matchingNotes[0].tag);
        return true;

      case 'Enter':
        // TODO(jaked)
        // if (this.props.notes.every(note => note.tag !== this.props.search)) {
        //   this.props.newNote(this.props.search);
        // }
        props.onSelect(props.search);
        props.focusEditor();
        return true;

      default: return false;
    }
  }

  return (<>
    <SearchBox
      ref={searchBoxRef}
      search={props.search}
      onSearch={props.onSearch}
      onKeyDown={onKeyDown}
    />
    { props.focusDir && (
      <Flex
        padding={2}
        onClick={() => props.onSelect(props.focusDir) }
      >
        <div onClick={e => { props.onFocusDir(null); e.stopPropagation() } } style={{ minWidth: '10px' }}>x</div>
        <div>{props.focusDir}</div>
      </Flex>
    )}
    <Notes
      ref={notesRef}
      notes={props.matchingNotes}
      selected={props.selected}
      onSelect={props.onSelect}
      onFocusDir={props.onFocusDir}
      focusEditor={props.focusEditor}
      toggleDirExpanded={props.toggleDirExpanded}
    />
  </>);
}));

export default Sidebar;
