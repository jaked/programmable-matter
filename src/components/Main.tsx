import * as fs from "fs";
import * as path from 'path';
import * as process from 'process';

import * as Immutable from 'immutable';

import { Observable } from 'rxjs';

import * as React from 'react';
import { Atom, Lens } from '@grammarly/focal';

import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';

import * as data from '../data';
import { Watcher } from '../files/Watcher';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

// TODO(jaked)
const ROOT = process.cwd();

// TODO(jaked) put notes state in stateAtom
// and selected state? why not
interface State {
  notes: data.Notes;
  selected: string | null;
}

export class Main extends React.Component<{}, State> {
  watcher: Watcher;
  stateAtom: Atom<Immutable.Map<string, any>> =
    Atom.create(Immutable.Map());

  constructor(props: {}) {
    super(props);

    this.state = {
      notes: Immutable.Map(),
      selected: null,
    }

    this.setNotesState = this.setNotesState.bind(this)
    this.watcher = new Watcher(this.setNotesState);

    this.handleSelect = this.handleSelect.bind(this)
    this.handleChange = this.handleChange.bind(this)
  }

  componentDidMount() {
    this.watcher.start()

    // TODO(jaked) how do we cancel this?
    // TODO(jaked) there's got to be a way to make an Atom from an Observable
    const nowAtom = this.stateAtom.lens(Main.immutableMapLens('now'));
    Observable
      .interval(1000)
      .startWith(0)
      .map(() => new Date().toString())
      .subscribe(now => nowAtom.set(now));
  }

  componentWillUnmount() {
    this.watcher.stop();
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
      fs.writeFileSync(path.resolve(ROOT, 'docs', this.state.selected), content);
    }
  }

  render() {
    // TODO(jaked) ugh
    const content: string | null =
      this.state.selected &&
      this.state.notes.get(
        this.state.selected,
        { tag: null, content: null }
      ).content;

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
              <Display state={this.stateAtom} content={content} />
            </Catch>
          </Grid>
        </Grid>
      </React.Fragment>
    );
  }

  // TODO(jaked) put this somewhere common
  static immutableMapLens<T>(key: string): Lens<Immutable.Map<string, T>, T> {
    return Lens.create(
      (map: Immutable.Map<string, T>) => map.get<any>(key, null),
      (t: T, map: Immutable.Map<string, T>) => map.set(key, t)
    )
  }
}
