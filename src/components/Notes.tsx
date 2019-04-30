import * as React from 'react';
import List from '@material-ui/core/List';
import * as data from '../data';
import { Note } from './Note';

interface Props {
}

interface State {
  notes: Array<data.Note>;
  selected: string | null;
}

export class Notes extends React.Component<Props, State> {
  state = {
    notes: [
      { tag: 'one', content: `# Hello world` },
      { tag: 'two', content: `this is a note` },
      { tag: 'three', content: `this is **another** note` },
    ],
    selected: 'one',
  }

  render() {
    const { notes, selected } = this.state;
    return (
      <List dense disablePadding>
      {notes.map(({ tag, content }) =>
        <Note
          key={tag}
          content={content}
          selected={tag === selected}
        />
      )}
      </List>
    );
  }
}
