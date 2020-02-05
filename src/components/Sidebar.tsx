import * as Immutable from 'immutable';
import React from 'react';
import { Notes } from './Notes';
import { SearchBox } from './SearchBox';
import * as data from '../data';

type Props = {
  search: string;
  onSearch: (s: string) => void;
  matchingNotes: data.CompiledNote[];
  matchingNotesDirs: data.NoteDir[];
  selected: string | null;
  onSelect: (s: string | null) => void;
  newNote: (s: string) => void;
  focusEditor: () => void;
}

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
      <Notes
        ref={this.notesRef}
        notes={this.props.matchingNotes}
        notesDirs={this.props.matchingNotesDirs}
        selected={this.props.selected}
        onSelect={this.props.onSelect}
        focusEditor={this.props.focusEditor}
      />
    </>);
  }
}
