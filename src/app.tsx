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

import Unhandled from 'electron-unhandled';

Unhandled();

// TODO(jaked)
const ROOT = process.cwd();

const notesCell = Signal.cellOk<data.Notes>(Immutable.Map());
const selectedCell = Signal.cellOk<string | null>(null);
let letCells = Immutable.Map<string, Immutable.Map<string, Signal.Cell<any>>>();

function setNotes(notes: data.Notes) {
  notesCell.setOk(notes);
  render();
}

function setSelected(selected: string | null) {
  selectedCell.setOk(selected);
  render();
}

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
    // TODO(jaked)
    // can we make this a separate reaction to an atom?
    fs.writeFileSync(path.resolve(ROOT, 'docs', selected), content);

    const notes = notesCell.get().update(selected, note => {
      const version = note.version + 1;
      return Object.assign({}, note, { content, version });
    });
    notesCell.setOk(notes);
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
    Compile.compileNotes(currentCompiledNotes, notes, mkCell);
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
  contentSignal.update(level);
  compiledNoteSignal.update(level);
  ReactDOM.render(
    <Main
      notes={notesCell.get()}
      selected={selectedCell.get()}
      content={contentSignal.get()}
      compiledNote={compiledNoteSignal.get()}
      onSelect={tag => setSelected(tag) }
      onChange={setContent}
    />,
    document.getElementById('main')
  );
}

render();
