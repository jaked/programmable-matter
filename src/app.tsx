import * as fs from "fs";
import * as Path from 'path';
import * as process from 'process';
import { ipcRenderer as ipc, remote } from 'electron';
import util from 'util';
import rimrafCallback from 'rimraf';
import ghPages from 'gh-pages';
const rimraf = util.promisify(rimrafCallback);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const publish = util.promisify(ghPages.publish);

import * as Immutable from 'immutable';

import Signal from './util/Signal';
import Trace from './util/Trace';
import * as data from './data';
import { Filesystem } from './files/Filesystem';

import * as Compile from './lang/Compile';

import Server from './Server';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';

import { Main } from './components/Main';
import { Session } from './components/react-simple-code-editor';

import * as GTasks from './integrations/gtasks';

import Unhandled from 'electron-unhandled';

Unhandled();

const debug = false;

export class App {
  // TODO(jaked)
  // global for the benefit of functions inside of Signal.map etc.
  // maybe build trace argument into Signal?
  // or have a current active trace in Trace instead of threading it around
  private __trace = new Trace();

  private compileDirty: boolean = true;

  private render = () => {
    this.__trace.reset();
    this.level++;

    // TODO(jaked) write this as a join instead of .get()s
    this.contentSignal.reconcile(this.__trace, this.level);
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

  private dirtyAndRender = () => {
    this.compileDirty = true;
    this.render();
  }

  public get highlightValid() { return !this.compileDirty }

    // TODO(jaked) make this configurable
  private filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
  private filesystem = new Filesystem(this.filesPath, this.dirtyAndRender);

  constructor() {
    this.filesystem.start(); // TODO(jaked) stop this on shutdown

    setInterval(() => {
      if (this.compileDirty) {
        this.compileDirty = false;

        this.__trace.reset();
        this.matchingNotesSignal.reconcile(this.__trace, this.level);
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

    // TODO(jaked) do we need to remove these somewhere?
    ipc.on('focus-search-box', () => this.mainRef.current && this.mainRef.current.focusSearchBox());
    ipc.on('toggle-side-bar-visible', this.toggleSideBarVisible);
    ipc.on('set-main-pane-view-code', () => this.setMainPaneView('code'));
    ipc.on('set-main-pane-view-display', () => this.setMainPaneView('display'));
    ipc.on('set-main-pane-view-split', () => this.setMainPaneView('split'));
    ipc.on('history-back', this.historyBack);
    ipc.on('history-forward', this.historyForward);

    ipc.on('publish-site', this.publishSite);
    ipc.on('sync-google-tasks', this.syncGoogleTasks);
  }

  private history: string[] = [];
  private historyIndex: number = -1; // index of current selection, or -1 if none
  private selectedCell = Signal.cellOk<string | null>(null, this.dirtyAndRender);
  public get selected() { return this.selectedCell.get() }
  public setSelected = (selected: string | null) => {
    if (selected != null) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(selected);
      this.historyIndex++;
    }
    this.selectedCell.setOk(selected);
  }
  public historyBack = () => {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.selectedCell.setOk(this.history[this.historyIndex]);
    }
  }
  public historyForward = () => {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.selectedCell.setOk(this.history[this.historyIndex])
    }
  }

  public searchCell = Signal.cellOk<string>('', this.dirtyAndRender);
  public get search() { return this.searchCell.get() }
  public setSearch = (search: string) => {
    this.searchCell.setOk(search);
  }

  private statusCell = Signal.cellOk<string | undefined>(undefined, this.render);
  public get status() { return this.statusCell.get() }
  public setStatus = (status: string | undefined) => {
    this.statusCell.setOk(status);
  }

  private sideBarVisibleCell = Signal.cellOk<boolean>(true, this.render);
  public get sideBarVisible() { return this.sideBarVisibleCell.get() }
  public toggleSideBarVisible = () => {
    // TODO(jaked) `update` method on cells
    this.sideBarVisibleCell.setOk(!this.sideBarVisibleCell.get());
  };

  private mainPaneViewCell = Signal.cellOk<'code' | 'display' | 'split'>('split', this.render);;
  public get mainPaneView() { return this.mainPaneViewCell.get() }
  public setMainPaneView = (view: 'code' | 'display' | 'split') => {
    this.mainPaneViewCell.setOk(view);
  }

  writeNote = (path: string, tag: string, meta: data.Meta, content: string) => {
    if (debug) console.log(`writeNote path=${path} tag=${tag}`);
    let buffer = Buffer.from(content, 'utf8');
    this.filesystem.update(path, buffer);
  }

  public newNote = (tag: string) => {
    // TODO(jaked) check that we aren't overwriting existing note
    this.writeNote(
      tag,
      tag,
      { type: 'mdx' },
      ''
    )
  }

  private sessionsCell = Signal.cellOk<Immutable.Map<string, Session>>(Immutable.Map());
  private sessionSignal =
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
  public get session() { return this.sessionSignal.get() }

  private letCells = Immutable.Map<string, Immutable.Map<string, Signal.Cell<any>>>();
  private mkCell = (module: string, name: string, init: any): Signal.Cell<any> => {
    let noteLetCells = this.letCells.get(module) || Immutable.Map();
    let letCell = noteLetCells.get(name) || Signal.cellOk(init, this.render);
    this.letCells = this.letCells.set(module, noteLetCells.set(name, letCell));
    return letCell;
  }

  private notesSignal =
    Compile.notesOfFiles(this.__trace, this.filesystem.files);

  private compiledNotesSignal =
    Compile.compileNotes(
      this.__trace,
      this.notesSignal,
      this.mkCell,
      this.setSelected
    );
  public get compiledNotes() { return this.compiledNotesSignal.get() }

  private compiledNoteSignal =
    Signal.label('compiledNote',
      Signal.join(this.compiledNotesSignal, this.selectedCell).map(([compiledNotes, selected]) => {
        if (selected) {
          const note = compiledNotes.get(selected);
          if (note) return note;
        }
        return null;
      })
    );
  public get compiledNote() { return this.compiledNoteSignal.get() }

  private contentSignal =
    Signal.label('content',
      Signal.join(this.notesSignal, this.selectedCell).flatMap(([notes, selected]) => {
        if (selected) {
          const note = notes.get(selected);
          if (note) {
            return note.map(note => {
              if (note.type === 'mdx' || note.type === 'txt' || note.type === 'json') return note.content;
              else return null;
            });
          }
        }
        return Signal.ok(null);
      })
    );
  public get content() { return this.contentSignal.get() }

  // TODO(jaked) maybe these functions can be generated via signals
  // then passed into components so there isn't so much dereferecing here
  public setContentAndSession = (content: string, session: Session) => {
    if (content === null) return;
    const selected = this.selectedCell.get();
    if (!selected) return;

    const noteSignal = this.notesSignal.get().get(selected);
    if (!noteSignal) return;
    const note = noteSignal.get();
    if (note.type !== 'mdx' && note.type !== 'txt' && note.type !== 'json') return;
    if (note.content === content) return;

    const sessions = this.sessionsCell.get().set(selected, session);
    this.sessionsCell.setOk(sessions);

    this.writeNote(note.path, note.tag, note.meta, content);
  }

  private matchingNotesSignal =
    Signal.label('matchingNotes',
      Signal.join(
        // TODO(jaked)
        // map matching function over individual note signals
        // so we only need to re-match notes that have changed
        this.compiledNotesSignal,
        this.searchCell
      ).map(([notes, search]) => {
        return this.__trace.time('match notes', () => {
          let matchingNotes = notes;
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
            matchingNotes = notes.filter(matches);
          }
          return matchingNotes.valueSeq().toArray().sort((a, b) =>
            a.tag < b.tag ? -1 : 1
          );
        })
      })
    );
  public get matchingNotes() { return this.matchingNotesSignal.get() }

  private server = new Server(this.compiledNotesSignal);

  private mainRef = React.createRef<Main>();
  private level = 0;

  private reactRender = (trace: Trace) => {
    trace.open('ReactDOM.render');
    ReactDOM.render(
      <Main
        ref={this.mainRef}
        app={this}
      />,
      document.getElementById('main')
    );
    trace.close();
  }

  publishSite = async () => {
    // TODO(jaked) generate random dir name?
    const tempdir = Path.resolve(remote.app.getPath("temp"), 'programmable-matter');
    // fs.rmdir(tempdir, { recursive: true }); // TODO(jaked) Node 12.10.0
    await rimraf(tempdir, { glob: false })
    await mkdir(tempdir);
    await writeFile(Path.resolve(tempdir, '.nojekyll'), '');
    await writeFile(Path.resolve(tempdir, 'CNAME'), "jaked.org");
    await Promise.all(this.compiledNotes.map(async note => {
      // TODO(jaked) figure out file extensions
      if (note.type === 'jpeg') {
        const notePath = Path.resolve(tempdir, note.path);
        await mkdir(Path.dirname(notePath), { recursive: true });
        await writeFile(notePath, note.buffer);
      } else if (note.type === 'table') {
        // ???
      } else {
        const notePath = Path.resolve(tempdir, note.path) + '.html';
        const node = note.compiled.get().rendered.get();  // TODO(jaked) fix Try.get()
        const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
        await mkdir(Path.dirname(notePath), { recursive: true });
        await writeFile(notePath, html);
      }
    }).values());
    if (true) {
      await publish(tempdir, {
        src: '**',
        dotfiles: true,
        branch: 'master',
        repo: 'https://github.com/jaked/jaked.github.io.git',
        message: 'published from Programmable Matter',
        name: 'Jake Donham',
        email: 'jake.donham@gmail.com',
      });
    }
  }

  syncGoogleTasks = () => {
    // TODO(jaked) should do this via Filesystem object
    // not via direct filesystem accesss
    const filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
    GTasks.authAndSyncTaskLists(filesPath);
  }
}

const app = new App();
