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

class App {
  // TODO(jaked)
  // global for the benefit of functions inside of Signal.map etc.
  // maybe build trace argument into Signal?
  // or have a current active trace in Trace instead of threading it around
  __trace = new Trace();

  compileDirty: boolean = true;

  render = () => {
    this.__trace = new Trace();
    this.level++;

    // TODO(jaked) write this as a join instead of .get()s
    this.contentSignal.reconcile(this.__trace, this.level);
    this.matchingNotesSignal.reconcile(this.__trace, this.level);
    this.sessionSignal.reconcile(this.__trace, this.level);

    // TODO(jaked) fix hack
    const compiledNote = this.compiledNoteSignal.get();
    if (compiledNote) {
      compiledNote.compiled.forEach(compiled =>
        compiled.rendered.reconcile(this.__trace, this.level)
      );
    }

    this.reactRender(this.__trace);
    console.log(this.__trace.finish());
  }

  dirtyAndRender = () => {
    this.compileDirty = true;
    this.render();
  }

    // TODO(jaked) make this configurable
  filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
  filesystem = new Filesystem(this.filesPath, this.dirtyAndRender);

  constructor() {
    this.filesystem.start(); // TODO(jaked) stop this on shutdown

    setInterval(() => {
      if (this.compileDirty) {
        this.compileDirty = false;

        this.__trace = new Trace();
        this.compiledNoteSignal.reconcile(this.__trace, this.level);

        // TODO(jaked) fix hack
        const compiledNote = this.compiledNoteSignal.get();
        if (compiledNote) {
          compiledNote.compiled.forEach(compiled =>
            compiled.rendered.reconcile(this.__trace, this.level)
          );
        }

        this.server.update(this.__trace, this.level);
        this.reactRender(this.__trace);
        console.log(this.__trace.finish());
      }
    }, 50);
  }

  selectedCell = Signal.cellOk<string | null>(null);
  setSelected = (selected: string | null) => {
    this.selectedCell.setOk(selected);
    this.dirtyAndRender();
  }

  searchCell = Signal.cellOk<string>('');
  setSearch = (search: string) => {
    this.searchCell.setOk(search);
    this.render();
  }

  statusCell = Signal.cellOk<string | undefined>(undefined, this.render);
  setStatus = (status: string | undefined) => {
    this.statusCell.setOk(status);
  }

  sideBarVisibleCell = Signal.cellOk<boolean>(true, this.render);
  toggleSideBarVisible = () => {
    // TODO(jaked) `update` method on cells
    this.sideBarVisibleCell.setOk(!this.sideBarVisibleCell.get());
  };

  mainPaneViewCell = Signal.cellOk<'code' | 'display' | 'split'>('split', this.render);;
  setMainPaneView = (view: 'code' | 'display' | 'split') => {
    this.mainPaneViewCell.setOk(view);
  }

  writeNote = (path: string, tag: string, meta: data.Meta, content: string) => {
    if (debug) console.log(`writeNote path=${path} tag=${tag}`);

    // TODO(jaked) don't perturb frontmatter unnecessarily
    let string = Graymatter.stringify(content, meta, { language: 'json' });
    // stringify adds trailing newline
    if (content.slice(-1) !== '\n')  {
      string = string.slice(0, -1);
    }

    let buffer = Buffer.from(string, 'utf8');
    this.filesystem.update(path, buffer);
  }

  newNote = (tag: string) => {
    // TODO(jaked) check that we aren't overwriting existing note
    this.writeNote(
      tag,
      tag,
      { type: 'mdx' },
      ''
    )
  }

  sessionsCell = Signal.cellOk<Immutable.Map<string, Session>>(Immutable.Map());
  sessionSignal =
    Signal.label('session',
      Signal.join(this.sessionsCell, this.selectedCell).map(([sessions, selected]) => {
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

  letCells = Immutable.Map<string, Immutable.Map<string, Signal.Cell<any>>>();
  mkCell = (module: string, name: string, init: any): Signal.Cell<any> => {
    let noteLetCells = this.letCells.get(module) || Immutable.Map();
    let letCell = noteLetCells.get(name) || Signal.cellOk(init, this.render);
    this.letCells = this.letCells.set(module, noteLetCells.set(name, letCell));
    return letCell;
  }

  currentNotes: data.Notes = Immutable.Map();
  notesSignal =
    Signal.label('notes',
      this.filesystem.files.map(files => {
        this.currentNotes = Compile.notesOfFiles(this.__trace, files, this.currentNotes);
        return this.currentNotes;
      })
    );

  // there might be a way to organize this with an Atom per note
  // but it's a lot simpler to handle them all at once
  currentCompiledNotes: data.CompiledNotes = Immutable.Map();
  compiledNotesSignal =
    Signal.label('compiledNotes',
      this.notesSignal.map(notes => {
        this.currentCompiledNotes =
          Compile.compileNotes(
            this.__trace,
            this.currentCompiledNotes,
            notes,
            this.mkCell,
            this.setSelected
          );
        return this.currentCompiledNotes;
      })
    );

  compiledNoteSignal =
    Signal.label('compiledNote',
      Signal.join(this.compiledNotesSignal, this.selectedCell).map(([compiledNotes, selected]) => {
        if (selected) {
          const note = compiledNotes.get(selected);
          if (note) return note;
        }
        return null;
      })
    );

  contentSignal =
    Signal.label('content',
      Signal.join(this.notesSignal, this.selectedCell).map(([notes, selected]) => {
        if (selected) {
          const note: data.Note | undefined = notes.get(selected);
          if (note && note.type !== 'jpeg') return note.content;
        }
        return null;
      })
    );

  setContentAndSession = (content: string, session: Session) => {
    if (content === null) return;
    const selected = this.selectedCell.get();
    if (!selected) return;

    const note = this.notesSignal.get().get(selected);
    if (!note) return;
    if (note.type === 'jpeg') return;
    if (note.content === content) return;

    const sessions = this.sessionsCell.get().set(selected, session);
    this.sessionsCell.setOk(sessions);

    this.writeNote(note.path, note.tag, note.meta, content);
  }

  matchingNotesSignal =
    Signal.label('matchingNotes',
      Signal.join(this.notesSignal, this.searchCell).map(([notes, search]) => {
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

  server = new Server(this.compiledNotesSignal);

  level = 0;

  reactRender = (trace: Trace) => {
    trace.open('ReactDOM.render');
    ReactDOM.render(
      <Main
        sideBarVisible={this.sideBarVisibleCell.get()}
        toggleSideBarVisible={this.toggleSideBarVisible}
        status={this.statusCell.get()}
        setStatus={this.setStatus}
        mainPaneView={this.mainPaneViewCell.get()}
        setMainPaneView={this.setMainPaneView}
        notes={this.matchingNotesSignal.get()}
        selected={this.selectedCell.get()}
        search={this.searchCell.get()}
        content={this.contentSignal.get()}
        highlightValid={!this.compileDirty}
        compiledNote={this.compiledNoteSignal.get()}
        session={this.sessionSignal.get()}
        onSelect={this.setSelected}
        onSearch={this.setSearch}
        onChange={this.setContentAndSession}
        newNote={this.newNote}
        compiledNotes={this.compiledNotesSignal.get()}
      />,
      document.getElementById('main')
    );
    trace.close();
  }
}

const app = new App();
