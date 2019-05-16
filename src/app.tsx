import * as fs from "fs";
import * as path from 'path';
import * as process from 'process';

import * as Immutable from 'immutable';

import { Atom, Lens } from '@grammarly/focal';

import * as data from './data';
import { Watcher } from './files/Watcher';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Main } from './components/Main';

import Unhandled from 'electron-unhandled';

Unhandled();

// TODO(jaked)
const ROOT = process.cwd();

// TODO(jaked) maybe this goes in data.ts
interface State {
  notes: data.Notes,
  selected: string | null;
  lets: Immutable.Map<string, any>
}

const stateAtom: Atom<State> =
  Atom.create({
    notes: Immutable.Map(),
    selected: null,
    lets: Immutable.Map()
  });

let notesAtom = stateAtom.lens('notes');
let selectedAtom = stateAtom.lens('selected');
let letsAtom = stateAtom.lens('lets');

// TODO(jaked)
// maybe this could be expressed better as composed lenses?
let contentAtom = stateAtom.lens(Lens.create(
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

// if the update arg is eta-contracted this doesn't work, maybe a this problem?
let watcher = new Watcher(x => notesAtom.modify(x));
watcher.start(); // TODO(jaked) stop this on shutdown

ReactDOM.render(
  <Main
    notes={notesAtom}
    selected={selectedAtom}
    lets={letsAtom}
    content={contentAtom}
  />,
  document.getElementById('main')
);

// TODO(jaked) how do we cancel this?
// TODO(jaked) there's got to be a way to make an Atom from an Observable
// TODO(jaked) move to render environment
// TOOD(jaked) can we make this a snapshot of now on render rather than a timer?
// const nowAtom = this.letsAtom.lens(Main.immutableMapLens('now'));
// Observable
//   .interval(1000)
//   .startWith(0)
//   .map(() => new Date().toString())
//   .subscribe(now => nowAtom.set(now));
