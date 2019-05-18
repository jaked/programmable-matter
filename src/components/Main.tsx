import * as Immutable from 'immutable';

import * as React from 'react';
import { Atom, ReadOnlyAtom } from '@grammarly/focal';
import * as Focal from '@grammarly/focal';

import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';

import * as data from '../data';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

const LiftedEditor = Focal.lift(Editor);
const LiftedNotes = Focal.lift(Notes);

interface Props {
  notes: ReadOnlyAtom<data.Notes>;
  compiledNotes: ReadOnlyAtom<data.Notes>;
  selected: Atom<string | null>;
  lets: Atom<Immutable.Map<string, any>>;
  content: Atom<string | null >;
}

export function Main({ notes, compiledNotes, selected, lets, content }: Props) {
  return (
    <React.Fragment>
      <CssBaseline />
      <Grid container direction='row' style={{ height: '100vh' }}>
        <Grid item xs={2}>
          <LiftedNotes
            notes={notes}
            selected={selected}
            onSelect={tag => selected.set(tag)}
          />
        </Grid>
        <Grid item xs={5}>
          <LiftedEditor content={content} onChange={c => content.set(c)} />
        </Grid>
        <Grid item xs={5}>
          <Catch>
            <Display
              state={lets}
              selected={selected}
              compiledNotes={compiledNotes}
            />
          </Catch>
        </Grid>
      </Grid>
    </React.Fragment>
  );
}
