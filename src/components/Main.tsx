import * as fs from "fs";

import * as React from 'react';
import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';

import * as data from '../data';
import { Watcher } from '../files/Watcher';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

interface Props {

}

interface State {
  notes: data.Notes;
  selected: string | null;
}

export class Main extends React.Component<{}, State> {
  watcher: Watcher;

  constructor(props: Props) {
    super(props);
    this.state = {
      notes: [],
      selected: null,
    }

    this.setNotesState = this.setNotesState.bind(this)
    this.watcher = new Watcher(this.setNotesState);

    this.handleSelect = this.handleSelect.bind(this)
    this.handleChange = this.handleChange.bind(this)
  }

  componentDidMount() {
    this.watcher.watch()
  }

  setNotesState(updateNotes: (notes: data.Notes) => data.Notes) {
    this.setState(state => ({
      notes: updateNotes(state.notes)
    }))
  }

  handleSelect(tag: string) {
    this.setState({
      selected: tag
    });
  }

  handleChange(content: string) {
    this.setState(state => ({
      notes: state.notes.map(note =>
        note.tag !== state.selected ?
        note :
        // TODO(jaked) is there a copying assign?
        Object.assign(note, { content })
      )
    }));

    if (this.state.selected) {
      fs.writeFileSync(this.state.selected, content);
    }
  }

  render() {
    // TODO(jaked) ugh
    const content: string | null =
      this.state.selected &&
      Object.assign(
        {},
        ...this.state.notes.map(({ tag, content }) => {
          return { [tag]: content };
        }))
      [this.state.selected]

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
            <Notes
              notes={this.state.notes}
              selected={this.state.selected}
              onSelect={this.handleSelect}
            />
          </Grid>
          <Grid item xs={5}>
            <Editor content={content} onChange={this.handleChange} />
          </Grid>
          <Grid item xs={5}>
            <Catch>
              <Display content={content} />
            </Catch>
          </Grid>
        </Grid>
      </React.Fragment>
    );
  }
}
