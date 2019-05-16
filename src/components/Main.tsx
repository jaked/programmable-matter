import * as fs from "fs";
import * as path from 'path';
import * as process from 'process';

import * as Immutable from 'immutable';

import { Observable } from 'rxjs';

import * as React from 'react';
import { Atom, Lens } from '@grammarly/focal';
import * as Focal from '@grammarly/focal';

import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';

import * as data from '../data';
import { Watcher } from '../files/Watcher';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

const LiftedEditor = Focal.lift(Editor);
const LiftedNotes = Focal.lift(Notes);

// TODO(jaked)
const ROOT = process.cwd();

interface State {
  notes: data.Notes,
  selected: string | null;
  lets: Immutable.Map<string, any>
}

export class Main extends React.Component<{}, {}> {
  watcher: Watcher;

  stateAtom: Atom<State> =
    Atom.create({
      notes: Immutable.Map(),
      selected: null,
      lets: Immutable.Map()
    });

  notesAtom = this.stateAtom.lens('notes');
  selectedAtom = this.stateAtom.lens('selected');
  letsAtom = this.stateAtom.lens('lets');

  // TODO(jaked)
  // maybe this could be expressed better as composed lenses?
  contentAtom = this.stateAtom.lens(Lens.create(
    (state: State) => {
      if (state.selected) {
        const note = state.notes.get(state.selected);
        if (note) return note.content;
      }
      return null;
    },
    (content: string | null, state: State) => {
      if (content && state.selected) {
        // TODO(jaked)
        // can we make this a separate reaction to an atom?
        fs.writeFileSync(path.resolve(ROOT, 'docs', state.selected), content);

        const notes = state.notes.update(state.selected, note =>
          Object.assign({}, note, { content })
        );

        return Object.assign({}, state, { notes });
      }
      return state;
    },
  ));

  constructor(props: {}) {
    super(props);

    this.setNotesState = this.setNotesState.bind(this)
    this.watcher = new Watcher(this.setNotesState);

    this.handleSelect = this.handleSelect.bind(this)
    this.handleChange = this.handleChange.bind(this)
  }

  componentDidMount() {
    this.watcher.start()

    // TODO(jaked) how do we cancel this?
    // TODO(jaked) there's got to be a way to make an Atom from an Observable
    const nowAtom = this.letsAtom.lens(Main.immutableMapLens('now'));
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
    this.notesAtom.modify(updateNotes);
  }

  handleSelect(tag: string) {
    this.selectedAtom.set(tag);
  }

  handleChange(content: string) {
    this.contentAtom.set(content);
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
              notes={this.notesAtom}
              selected={this.selectedAtom}
              onSelect={this.handleSelect}
            />
          </Grid>
          <Grid item xs={5}>
            <LiftedEditor content={this.contentAtom} onChange={this.handleChange} />
          </Grid>
          <Grid item xs={5}>
            <Catch>
              <Display state={this.letsAtom} content={this.contentAtom} />
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
