import * as React from 'react';

import * as Try from '../util/Try';
import * as data from './../data';

interface Props {
  compiledNote: data.Note | null;
}

export class Display extends React.Component<Props, {}> {
  render() {
    const note = this.props.compiledNote;
    try {
      if (note && note.compiled)
        return Try.get(note.compiled.rendered);
      throw new Error('no note');
    } catch (e) {
      return <pre>{e.stack}</pre>
    }
  }
}
