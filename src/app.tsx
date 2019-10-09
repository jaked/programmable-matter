import * as fs from "fs";
import * as path from 'path';
import * as process from 'process';

import * as Graymatter from 'gray-matter';
import * as Immutable from 'immutable';

import Signal from './util/Signal';
import { Cell } from './util/Cell';
import Trace from './util/Trace';
import * as data from './data';
import { Watcher } from './files/Watcher';

import * as Compile from './lang/Compile';

import Server from './Server';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Main } from './components/Main';
import * as RSCEditor from './components/react-simple-code-editor';

import Unhandled from 'electron-unhandled';

Unhandled();

// TODO(jaked)
// global for the benefit of functions inside of Signal.map etc.
// maybe build trace argument into Signal?
// or have a current active trace in Trace instead of threading it around
let __trace = new Trace();

// TODO(jaked) make this configurable
const notesPath = fs.realpathSync(path.resolve(process.cwd(), 'docs'));

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

const matchingNotesSignal =
  Signal.label('matchingNotes',
    Signal.joinMap(notesCell, searchCell, (notes, search) => {
      if (search) {
        // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
        const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        const regexp = RegExp(escaped, 'i');

        function matches(note: data.Note): boolean {
          if (note.content.match(regexp)) return true;
          if (note.tag.match(regexp)) return true;
          if (note.meta.tags && note.meta.tags.some(tag => tag.match(regexp))) return true;
          return false;
        }
        return notes
          .filter(matches)
          .valueSeq().toArray();
      } else {
        return notes
          .valueSeq().toArray();
      }
    })
  );

const contentSignal =
  Signal.label('content',
    Signal.joinMap(notesCell, selectedCell, (notes, selected) => {
      if (selected) {
        const note = notes.get(selected);
        if (note) return note.content;
      }
      return null;
    })
  );

function setContent(content: string | null) {
  const selected = selectedCell.get();
  if (content != null && selected) {
    const notes = notesCell.get().update(selected, note => {
      if (note.content === content) return note;

      // TODO(jaked) don't perturb frontmatter unnecessarily
      let matter = Graymatter.stringify(content, note.meta, { language: 'json' });
      // stringify adds trailing newline
      if (content.slice(-1) !== '\n')  {
        matter = matter.slice(0, -1);
      }
      fs.writeFileSync(note.path, matter);

      const version = note.version + 1;
      return Object.assign({}, note, { content, version });
    });
    notesCell.setOk(notes);
    render();
  }
}

function newNote(tag: string) {
  const note = {
    meta: { type: 'mdx' },
    path: path.resolve(notesPath, tag),
    tag,
    type: 'mdx',
    content: '',
    version: 0
  } as const
  notesCell.setOk(notesCell.get().set(tag, note))
}

const sessionSignal =
  Signal.label('session',
    Signal.joinMap(sessionsCell, selectedCell, (sessions, selected) => {
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
        },
        selectionStart: 0,
        selectionEnd: 0
      };
    })
  );

function saveSession(session: RSCEditor.Session) {
  const selected = selectedCell.get();
  if (selected) {
    const sessions = sessionsCell.get().set(selected, session);
    sessionsCell.setOk(sessions);
    render();
  }
}

let watcher = new Watcher(notesPath, f => {
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
const compiledNotesSignal =
  Signal.label('compiledNotes',
    notesCell.map(notes => {
      currentCompiledNotes =
        Compile.compileNotes(__trace, currentCompiledNotes, notes, mkCell, setSelected);
      return currentCompiledNotes;
    })
  );

let compiledNoteSignal =
  Signal.label('compiledNote',
    Signal.joinMap(compiledNotesSignal, selectedCell, (compiledNotes, selected) => {
      if (selected) {
        const note = compiledNotes.get(selected);
        if (note) return note;
      }
      return null;
    })
  );

let level = 0;
function render() {
  __trace = new Trace();
  level++;
  // TODO(jaked) write this as a join instead of .get()s
  contentSignal.update(__trace, level);
  compiledNoteSignal.update(__trace, level);
  matchingNotesSignal.update(__trace, level);
  sessionSignal.update(__trace, level);
  __trace.open('ReactDOM.render');
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
      newNote={newNote}
      notesPath={notesPath}
      compiledNotes={compiledNotesSignal.get()}
    />,
    document.getElementById('main')
  );
  __trace.close();
  console.log(__trace.finish());
}

const server = new Server(compiledNotesSignal);

render();
