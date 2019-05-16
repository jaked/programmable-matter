import * as Immutable from 'immutable';

import * as React from 'react';
import { Atom } from '@grammarly/focal';
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
  notes: Atom<data.Notes>;
  selected: Atom<string | null>;
  lets: Atom<Immutable.Map<string, any>>;
  content: Atom<string | null >;
}

export class Main extends React.Component<Props, {}> {
  constructor(props: Props) {
    super(props);

    this.setNotesState = this.setNotesState.bind(this)
    this.handleSelect = this.handleSelect.bind(this)
    this.handleChange = this.handleChange.bind(this)
  }

  setNotesState(updateNotes: (notes: data.Notes) => data.Notes) {
    this.props.notes.modify(updateNotes);
  }

  handleSelect(tag: string) {
    this.props.selected.set(tag);
  }

  handleChange(content: string) {
    this.props.content.set(content);
  }

  render() {
    return (
      <React.Fragment>
        <CssBaseline />
        <Grid container direction='row'>
          <Grid item xs={12}>
            <TextField
              autoFocus
              fullWidth
              margin='dense'
              variant='outlined'
            />
          </Grid>
          <Grid item xs={2}>
            <LiftedNotes
              notes={this.props.notes}
              selected={this.props.selected}
              onSelect={this.handleSelect}
            />
          </Grid>
          <Grid item xs={5}>
            <LiftedEditor content={this.props.content} onChange={this.handleChange} />
          </Grid>
          <Grid item xs={5}>
            <Catch>
              <Display state={this.props.lets} content={this.props.content} />
            </Catch>
          </Grid>
        </Grid>
      </React.Fragment>
    );
  }
}
