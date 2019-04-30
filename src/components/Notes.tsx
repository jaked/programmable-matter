import * as React from 'react';
import { Flex } from 'rebass';
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
      <Flex flexDirection='column'>
      {notes.map(({ tag, content }) =>
        <Note
          key={tag}
          content={content}
          selected={tag === selected}
        />
      )}
      </Flex>
    );
  }
}