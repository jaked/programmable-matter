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

export class Sidebar extends React.Component<Props, {}> {
  notesRef = React.createRef<HTMLDivElement>();
  searchBoxRef = React.createRef<SearchBox>();

  focusSearchBox = () => {
    this.searchBoxRef.current && this.searchBoxRef.current.focus();
  }

  focusNotes = () => {
    this.notesRef.current && this.notesRef.current.focus();
  }

  onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return false;

    switch (e.key) {
      case 'ArrowUp':
        this.focusNotes();
        this.props.onSelect(this.props.matchingNotes[this.props.matchingNotes.length - 1].tag);
        return true;

      case 'ArrowDown':
        this.focusNotes();
        this.props.onSelect(this.props.matchingNotes[0].tag);
        return true;

      case 'Enter':
        if (this.props.matchingNotes.every(note => note.tag !== this.props.search)) {
          this.props.newNote(this.props.search);
        }
        this.props.onSelect(this.props.search);
        this.props.focusEditor();
        return true;

      default: return false;
    }
  }

  render() {
    return (<>
      <SearchBox
        ref={this.searchBoxRef}
        search={this.props.search}
        onSearch={this.props.onSearch}
        onKeyDown={this.onKeyDown}
      />
      { this.props.focusDir && (
        <Flex
          padding={2}
          onClick={() => this.props.onSelect(this.props.focusDir) }
        >
          <div onClick={e => { this.props.onFocusDir(null); e.stopPropagation() } } style={{ minWidth: '10px' }}>x</div>
          <div>{this.props.focusDir}</div>
        </Flex>
      )}
      <Notes
        ref={this.notesRef}
        notes={this.props.matchingNotes}
        selected={this.props.selected}
        onSelect={this.props.onSelect}
        onFocusDir={this.props.onFocusDir}
        focusEditor={this.props.focusEditor}
        toggleDirExpanded={this.props.toggleDirExpanded}
      />
    </>);
  }
}
