import * as fs from "fs";
import * as Path from 'path';
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
const filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));

const filesCell = Signal.cellOk<data.Files>(Immutable.Map());
const sessionsCell = Signal.cellOk<Immutable.Map<string, RSCEditor.Session>>(Immutable.Map());
const selectedCell = Signal.cellOk<string | null>(null);
const searchCell = Signal.cellOk<string>('');
let letCells = Immutable.Map<string, Immutable.Map<string, Signal.Cell<any>>>();

function setFiles(files: data.Files) {
  filesCell.setOk(files);
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

const statusCell = Signal.cellOk<string | undefined>(undefined);
function setStatus(status: string | undefined) {
  // TODO(jaked)
  // handle no-op changes systematically
  // e.g. track during signal update whether any actual change has occurred
  // and skip render if not
  if (status !== statusCell.get()) {
    statusCell.setOk(status);
    render();
  }
}

const sideBarVisibleCell = Signal.cellOk<boolean>(true);
function toggleSideBarVisible() {
  // TODO(jaked) `update` method on cells
  sideBarVisibleCell.setOk(!sideBarVisibleCell.get());
  render();
};

const mainPaneViewCell = Signal.cellOk<'code' | 'display' | 'split'>('split');
function setMainPaneView(view: 'code' | 'display' | 'split') {
  mainPaneViewCell.setOk(view);
  render();
}

function writeNote(path: string, tag: string, meta: data.Meta, content: string) {
  // TODO(jaked) don't perturb frontmatter unnecessarily
  let string = Graymatter.stringify(content, meta, { language: 'json' });
  // stringify adds trailing newline
  if (content.slice(-1) !== '\n')  {
    string = string.slice(0, -1);
  }

  let buffer = Buffer.from(string, 'utf8');
  // TODO(jaked) surface errors
  fs.writeFileSync(Path.resolve(filesPath, path), buffer);

  const oldFile = filesCell.get().get(path);
  var file: data.File;
  if (oldFile) {
    // TODO(jaked) check that buffer has changed
    const version = oldFile.version + 1;
    file = Object.assign({}, oldFile, { version, buffer })
  } else {
    file = { path, version: 0, buffer }
  }
  filesCell.setOk(filesCell.get().set(tag, file));

  render();
}

function newNote(tag: string) {
  // TODO(jaked) check that we aren't overwriting existing note
  writeNote(
    tag,
    tag,
    { type: 'mdx' },
    ''
  )
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

let watcher = new Watcher(filesPath, f => {
  setFiles(f(filesCell.get()));
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
let currentCompiledNotes: data.CompiledNotes = Immutable.Map();
const compiledNotesSignal =
  Signal.label('compiledNotes',
    filesCell.map(notes => {
      currentCompiledNotes =
        Compile.compileFiles(__trace, currentCompiledNotes, notes, mkCell, setSelected);
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

const contentSignal =
  Signal.label('content',
    Signal.joinMap(compiledNotesSignal, selectedCell, (notes, selected) => {
      if (selected) {
        const note: data.Note | undefined = notes.get(selected);
        if (note && note.type !== 'jpeg') return note.content;
      }
      return null;
    })
  );

function setContent(content: string | null) {
  if (content === null) return;
  const selected = selectedCell.get();
  if (!selected) return;

  const note = compiledNotesSignal.get().get(selected);
  if (!note) return;
  if (note.type === 'jpeg') return;
  if (note.content === content) return;

  writeNote(note.path, note.tag, note.meta, content);
}

const matchingNotesSignal =
  Signal.label('matchingNotes',
    Signal.joinMap(compiledNotesSignal, searchCell, (notes, search) => {
      let matchingNotes = notes;
      if (search) {
        // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
        const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        const regexp = RegExp(escaped, 'i');

        function matches(note: data.Note): boolean {
          if (note.type !== 'jpeg' && note.content.match(regexp)) return true;
          if (note.tag.match(regexp)) return true;
          if (note.meta.tags && note.meta.tags.some(tag => tag.match(regexp))) return true;
          return false;
        }
        matchingNotes = notes.filter(matches);
      }
      return matchingNotes.valueSeq().toArray().sort((a, b) =>
        a.tag < b.tag ? -1 : 1
      );
    })
  );

const server = new Server(compiledNotesSignal);

let level = 0;

function render() {
  __trace = new Trace();
  level++;
  // TODO(jaked) write this as a join instead of .get()s
  compiledNoteSignal.update(__trace, level);
  contentSignal.update(__trace, level);
  matchingNotesSignal.update(__trace, level);
  sessionSignal.update(__trace, level);

  server.update(__trace, level);

  __trace.open('ReactDOM.render');
  ReactDOM.render(
    <Main
      sideBarVisible={sideBarVisibleCell.get()}
      toggleSideBarVisible={toggleSideBarVisible}
      status={statusCell.get()}
      setStatus={setStatus}
      mainPaneView={mainPaneViewCell.get()}
      setMainPaneView={setMainPaneView}
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
      compiledNotes={compiledNotesSignal.get()}
    />,
    document.getElementById('main')
  );
  __trace.close();
  console.log(__trace.finish());
}

render();
