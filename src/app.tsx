import * as fs from "fs";
import * as Path from 'path';
import * as process from 'process';

import * as Graymatter from 'gray-matter';
import * as Immutable from 'immutable';

import Signal from './util/Signal';
import Trace from './util/Trace';
import * as data from './data';
import { Filesystem } from './files/Filesystem';

import * as Compile from './lang/Compile';

import Server from './Server';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Main } from './components/Main';
import { Session } from './components/react-simple-code-editor';

import Unhandled from 'electron-unhandled';

Unhandled();

const debug = false;

// TODO(jaked)
// global for the benefit of functions inside of Signal.map etc.
// maybe build trace argument into Signal?
// or have a current active trace in Trace instead of threading it around
let __trace = new Trace();

// TODO(jaked) make this configurable
const filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));

let filesystem = new Filesystem(filesPath, render);
filesystem.start(); // TODO(jaked) stop this on shutdown

const sessionsCell = Signal.cellOk<Immutable.Map<string, Session>>(Immutable.Map());
const selectedCell = Signal.cellOk<string | null>(null);
const searchCell = Signal.cellOk<string>('');
let letCells = Immutable.Map<string, Immutable.Map<string, Signal.Cell<any>>>();

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
  if (debug) console.log(`writeNote path=${path} tag=${tag}`);

  // TODO(jaked) don't perturb frontmatter unnecessarily
  let string = Graymatter.stringify(content, meta, { language: 'json' });
  // stringify adds trailing newline
  if (content.slice(-1) !== '\n')  {
    string = string.slice(0, -1);
  }

  let buffer = Buffer.from(string, 'utf8');
  filesystem.update(path, buffer);
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
    Signal.join(sessionsCell, selectedCell).map(([sessions, selected]) => {
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

function mkCell(module: string, name: string, init: any): Signal.Cell<any> {
  let noteLetCells = letCells.get(module) || Immutable.Map();
  let letCell = noteLetCells.get(name) || Signal.cellOk(init, render);
  letCells = letCells.set(module, noteLetCells.set(name, letCell));
  return letCell;
}

let currentNotes: data.Notes = Immutable.Map();
const notesSignal =
  Signal.label('notes',
    filesystem.files.map(files => {
      currentNotes = Compile.notesOfFiles(__trace, files, currentNotes);
      return currentNotes;
    })
  );

// there might be a way to organize this with an Atom per note
// but it's a lot simpler to handle them all at once
let currentCompiledNotes: data.CompiledNotes = Immutable.Map();
const compiledNotesSignal =
  Signal.label('compiledNotes',
    notesSignal.map(notes => {
      currentCompiledNotes =
        Compile.compileNotes(__trace, currentCompiledNotes, notes, mkCell, setSelected);
      return currentCompiledNotes;
    })
  );

let compiledNoteSignal =
  Signal.label('compiledNote',
    Signal.join(compiledNotesSignal, selectedCell).map(([compiledNotes, selected]) => {
      if (selected) {
        const note = compiledNotes.get(selected);
        if (note) return note;
      }
      return null;
    })
  );

const contentSignal =
  Signal.label('content',
    Signal.join(notesSignal, selectedCell).map(([notes, selected]) => {
      if (selected) {
        const note: data.Note | undefined = notes.get(selected);
        if (note && note.type !== 'jpeg') return note.content;
      }
      return null;
    })
  );

function setContentAndSession(content: string, session: Session) {
  if (content === null) return;
  const selected = selectedCell.get();
  if (!selected) return;

  const note = notesSignal.get().get(selected);
  if (!note) return;
  if (note.type === 'jpeg') return;
  if (note.content === content) return;

  const sessions = sessionsCell.get().set(selected, session);
  sessionsCell.setOk(sessions);

  writeNote(note.path, note.tag, note.meta, content);
}

const matchingNotesSignal =
  Signal.label('matchingNotes',
    Signal.join(notesSignal, searchCell).map(([notes, search]) => {
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

function reactRender(trace: Trace) {
  trace.open('ReactDOM.render');
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

      // TODO(jaked)
      // this is unnecessarily conservative since level can be
      // incremented by actions that don't affect compilation.
      // figure out a way to compute whether a signal is stale
      // with respect to another signal.
      highlightValid={compiledNoteSignal.level === level}

      compiledNote={compiledNoteSignal.get()}
      session={sessionSignal.get()}
      onSelect={setSelected}
      onSearch={setSearch}
      onChange={setContentAndSession}
      newNote={newNote}
      compiledNotes={compiledNotesSignal.get()}
    />,
    document.getElementById('main')
  );
  trace.close();
}

let compileDirty: boolean = true;

setInterval(() => {
  if (compileDirty) {
    __trace = new Trace();
    compiledNoteSignal.update(__trace, level);

    // TODO(jaked) fix hack
    const compiledNote = compiledNoteSignal.get();
    if (compiledNote) compiledNote.compiled.get().rendered.update(__trace, level);

    server.update(__trace, level);
    reactRender(__trace);
    console.log(__trace.finish());
    compileDirty = false;
  }
}, 50);

function render() {
  __trace = new Trace();
  level++;

  // TODO(jaked) write this as a join instead of .get()s
  contentSignal.update(__trace, level);
  matchingNotesSignal.update(__trace, level);
  sessionSignal.update(__trace, level);

  // TODO(jaked) fix hack
  const compiledNote = compiledNoteSignal.get();
  if (compiledNote) compiledNote.compiled.get().rendered.update(__trace, level);

  reactRender(__trace);
  console.log(__trace.finish());

  // TODO(jaked) only on edit
  compileDirty = true;
}

render();
