import * as React from 'react';

import { Catch } from './Catch';
import * as data from './../data';

interface Props {
  compiledNote: data.CompiledNote | null;
}

export function Display({ compiledNote: note }: Props) {
  try {
    if (note) {
      let rendered;
      Object.values(note.compiled).forEach(compiled => {
        rendered = compiled?.get().rendered.get();
      });
      return (<Catch>{rendered}</Catch>);
    }
    throw new Error('no note');
  } catch (e) {
    return <pre>{e.stack}</pre>
  }
}
