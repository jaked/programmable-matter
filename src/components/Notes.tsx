import React from 'react';
import List from '@material-ui/core/List';
import * as data from '../data';
import { Note } from './Note';

interface Props {
  notes: Array<data.Note>;
  selected: string | null;
  onSelect: (tag: string) => void;
}

interface State {
}

export class Notes extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
  }

  render() {
    const { notes, selected, onSelect } = this.props;
    return (
      <List dense disablePadding>
      {notes.map((note) =>
        <Note
          key={note.tag}
          note={note}
          selected={note.tag === selected}
          onClick={ () => onSelect(note.tag) }
        />
      )}
      </List>
    );
  }
}
