import * as fs from "fs";
import * as path from 'path';
import * as process from 'process';

import * as Immutable from 'immutable';

import Signal from './util/Signal';
import { Cell } from './util/Cell';
import * as data from './data';
import { Watcher } from './files/Watcher';

import * as Compile from './lang/Compile';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Main } from './components/Main';
import * as RSCEditor from './components/react-simple-code-editor';

import Unhandled from 'electron-unhandled';

Unhandled();

// TODO(jaked)
const ROOT = process.cwd();

const notesCell = Signal.cellOk<data.Notes>(Immutable.Map());
const sessionsCell = Signal.cellOk<Immutable.Map<string, RSCEditor.Session>>(Immutable.Map());
const selectedCell = Signal.cellOk<string | null>(null);
const searchCell = Signal.cellOk<string>('');
let letCells = Immutable.Map<string, Immutable.Map<string, Signal.Cell<any>>>();

function setNotes(notes: data.Notes) {
  notesCell.setOk(notes);
  render();
}

function setSelected(selected: string | null) {
  selectedCell.setOk(selected);
  render();
}

function setSearch(search: string) {
  searchCell.setOk(search);
  render();
}

const matchingNotesSignal = Signal.joinMap(notesCell, searchCell, (notes, search) => {
  if (search) {
    // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regexp = RegExp(escaped, 'i');
    return notes
      .filter(note => note.content.match(regexp) || note.tag.match(regexp))
      .valueSeq().toArray();
  } else {
    return notes
      .valueSeq().toArray();
  }
});

const contentSignal = Signal.joinMap(notesCell, selectedCell, (notes, selected) => {
  if (selected) {
    const note = notes.get(selected);
    if (note) return note.content;
  }
  return null;
});

function setContent(content: string | null) {
  const selected = selectedCell.get();
  if (content != null && selected) {
    const notes = notesCell.get().update(selected, note => {
      fs.writeFileSync(note.path, content);
      const version = note.version + 1;
      return Object.assign({}, note, { content, version });
    });
    notesCell.setOk(notes);
    render();
  }
}

const sessionSignal = Signal.joinMap(sessionsCell, selectedCell, (sessions, selected) => {
  if (selected) {
    const session = sessions.get(selected);
    if (session) {
      return session;
    }
  }
  // TODO(jaked)
  // empty session should be defined on RSCEditor
  return {
    history: {
      stack: [],
      offset: -1,
    }
  };
});

function saveSession(session: RSCEditor.Session) {
  const selected = selectedCell.get();
  if (selected) {
    const sessions = sessionsCell.get().set(selected, session);
    sessionsCell.setOk(sessions);
    render();
  }
}

let watcher = new Watcher(f => {
  setNotes(f(notesCell.get()));
});
watcher.start(); // TODO(jaked) stop this on shutdown

class CellImpl<T> implements Cell<T> {
  cell: Signal.Cell<T>;
  constructor(cell: Signal.Cell<T>) {
    this.cell = cell;
  }
  get() { return this.cell.get(); }
  set(t: any) {
    this.cell.setOk(t);
    render();
  }
}

function mkCell(module: string, name: string, init: any): Cell<any> {
  let noteLetCells = letCells.get(module) || Immutable.Map();
  let letCell = noteLetCells.get(name) || Signal.cellOk(init);
  letCells = letCells.set(module, noteLetCells.set(name, letCell));
  return new CellImpl(letCell);
}

// there might be a way to organize this with an Atom per note
// but it's a lot simpler to handle them all at once
let currentCompiledNotes: data.Notes = Immutable.Map();
let compiledNotesSignal = notesCell.map(notes => {
  currentCompiledNotes =
    Compile.compileNotes(currentCompiledNotes, notes, mkCell, setSelected);
  return currentCompiledNotes;
});

let compiledNoteSignal =
  Signal.joinMap(compiledNotesSignal, selectedCell, (compiledNotes, selected) => {
    if (selected) {
      const note = compiledNotes.get(selected);
      if (note) return note;
    }
    return null;
  });

let level = 0;
function render() {
  level++;
  // TODO(jaked) write this as a join instead of .get()s
  contentSignal.update(level);
  compiledNoteSignal.update(level);
  matchingNotesSignal.update(level);
  sessionSignal.update(level);
  ReactDOM.render(
    <Main
      notes={matchingNotesSignal.get()}
      selected={selectedCell.get()}
      search={searchCell.get()}
      content={contentSignal.get()}
      compiledNote={compiledNoteSignal.get()}
      session={sessionSignal.get()}
      onSelect={setSelected}
      onSearch={setSearch}
      onChange={setContent}
      saveSession={saveSession}
    />,
    document.getElementById('main')
  );
}

render();
