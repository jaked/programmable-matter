import React from 'react';
import { Box } from 'rebass';
import * as data from '../data';
import { Note } from './Note';

interface Props {
  notes: data.Notes;
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
    const notesArray = notes.valueSeq().toArray();

    return (
      <Box>
      {notesArray.map((note) =>
        <Note
          key={note.tag}
          note={note}
          selected={note.tag === selected}
          onClick={ () => onSelect(note.tag) }
        />
      )}
      </Box>
    );
  }
}
