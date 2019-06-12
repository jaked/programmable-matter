import * as React from 'react';

import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';

import * as data from '../data';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

interface Props {
  notes: data.Notes;
  selected: string | null;
  content: string | null;
  compiledNote: data.Note | null;
  onSelect: (tag: string | null) => void;
  onChange: (content: string | null) => void;
}

export function Main({ notes, selected, content, compiledNote, onSelect, onChange }: Props) {
  return (
    <React.Fragment>
      <CssBaseline />
      <Grid container direction='row' style={{ height: '100vh' }}>
        <Grid item xs={2} style={{ height: '100%', overflowY: 'auto' }}>
          <Notes
            notes={notes}
            selected={selected}
            onSelect={onSelect}
          />
        </Grid>
        <Grid item xs={5} style={{ height: '100%', overflowY: 'auto' }}>
          <Editor
            content={content}
            compiledNote={compiledNote}
            onChange={onChange}
          />
        </Grid>
        <Grid item xs={5} style={{ height: '100%', overflowY: 'auto' }}>
          <Catch>
            <Display compiledNote={compiledNote} />
          </Catch>
        </Grid>
      </Grid>
    </React.Fragment>
  );
}
