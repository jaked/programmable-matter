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

import { bug } from './util/bug';
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
import { Session, emptySession } from './components/react-simple-code-editor';

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
    this.viewSignal.reconcile(this.__trace, this.level);
    this.contentSignal.reconcile(this.__trace, this.level);
    this.sessionSignal.reconcile(this.__trace, this.level);

    // TODO(jaked) fix hack
    const compiledNote = this.compiledNoteSignal.get();
    if (compiledNote) {
      Object.values(compiledNote.compiled).forEach(compiled =>
        compiled?.forEach(compiled =>
          compiled.rendered.reconcile(this.__trace, this.level)
        )
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
        this.matchingNotesTreeSignal.reconcile(this.__trace, this.level);
        this.compiledNoteSignal.reconcile(this.__trace, this.level);

        // TODO(jaked) fix hack
        const compiledNote = this.compiledNoteSignal.get();
        if (compiledNote) {
          Object.values(compiledNote.compiled).forEach(compiled =>
            compiled?.forEach(compiled =>
              compiled.rendered.reconcile(this.__trace, this.level)
            )
          );
        }

        this.server.update(this.__trace, this.level);
        this.reactRender(this.__trace);
        console.log(this.__trace.finish());
      }
    }, 50);

    // TODO(jaked) do we need to remove these somewhere?
    ipc.on('focus-search-box', () => this.mainRef.current && this.mainRef.current.focusSearchBox());
    ipc.on('toggle-sidebar-visible', this.toggleSidebarVisible);
    ipc.on('set-main-pane-view', (_, view: 'code' | 'display' | 'split') => {
      this.setMainPaneView(view)
    });
    ipc.on('set-editor-view', (_, view: 'mdx' | 'json' | 'meta') => {
      this.setEditorView(view)
    });
    ipc.on('history-back', this.historyBack);
    ipc.on('history-forward', this.historyForward);
    ipc.on('previous-problem', this.previousProblem);
    ipc.on('next-problem', this.nextProblem);

    ipc.on('delete-note', this.deleteNote);

    ipc.on('publish-site', this.publishSite);
    ipc.on('sync-google-tasks', this.syncGoogleTasks);
  }

  private history: string[] = [];
  private historyIndex: number = -1; // index of current selection, or -1 if none
  private selectedCell = Signal.cellOk<string | null>(null, this.dirtyAndRender);
  public get selected() { return this.selectedCell.get() }
  public setSelected = (selected: string | null) => {
    if (selected === this.selected) return;
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
  public toggleSidebarVisible = () => {
    this.sideBarVisibleCell.update(b => !b);
  };

  private mainPaneViewCell = Signal.cellOk<'code' | 'display' | 'split'>('split', this.render);
  public get mainPaneView() { return this.mainPaneViewCell.get() }
  public setMainPaneView = (view: 'code' | 'display' | 'split') => {
    this.mainPaneViewCell.setOk(view);
  }

  private editorViewCell = Signal.cellOk<'mdx' | 'json' | 'meta'>('mdx', this.render);
  public get editorView() { return this.editorViewCell.get() }
  public setEditorView = (view: 'mdx' | 'json' | 'meta') => {
    this.editorViewCell.setOk(view);
  }

  deleteNote = () => {
    const selected = this.selected;
    const view = this.view;
    if (!selected || !view) return;

    const noteSignal = this.notesSignal.get().get(selected);
    if (!noteSignal) return;
    const note = noteSignal.get();

    Object.values(note.files).forEach(file => {
      if (file) this.filesystem.delete(file.path);
    });
  }

  public newNote = (tag: string) => {
    this.filesystem.update(tag, Buffer.from('', 'utf8'));
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
        return emptySession();
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

  private viewContentSignal: Signal<[data.Types, string] | null> =
    Signal.label('viewContent',
      Signal.join(
        this.notesSignal,
        this.selectedCell,
        this.editorViewCell
      ).flatMap(([notes, selected, editorView]) => {
        if (selected) {
          const note = notes.get(selected);
          if (note) {
            return note.map(note => {
              const editorViewContent = note.content[editorView];
              if (editorViewContent) return [editorView, editorViewContent];
              if (note.content.mdx) return ['mdx', note.content.mdx];
              if (note.content.json) return ['json', note.content.json];
              if (note.content.meta) return ['meta', note.content.meta];
              return null;
            });
          }
        }
        return Signal.ok(null);
      })
    );

  private viewSignal = this.viewContentSignal.map(viewContent => {
    if (!viewContent) return null;
    else {
      const [view, _] = viewContent;
      return view;
    }
  });
  public get view() { return this.viewSignal.get() }

  private contentSignal = this.viewContentSignal.map(viewContent => {
    if (!viewContent) return null;
    else {
      const [_, content] = viewContent;
      return content;
    }
  });
  public get content() { return this.contentSignal.get() }

  // TODO(jaked) maybe these functions can be generated via signals
  // then passed into components so there isn't so much dereferencing here
  public setContentAndSession = (content: string, session: Session) => {
    if (content === null) return;
    const selected = this.selectedCell.get();
    const view = this.viewSignal.get();
    if (!selected || !view) return;

    const sessions = this.sessionsCell.get().set(selected, session);
    this.sessionsCell.setOk(sessions);

    const noteSignal = this.notesSignal.get().get(selected);
    if (!noteSignal) return;
    const note = noteSignal.get();
    const keys = Object.keys(note.content);
    if (keys.length === 0) return;
    const oldContent = note.content[keys[0]];
    if (oldContent === content) return;

    this.filesystem.update(note.files[view].path, Buffer.from(content, 'utf8'));
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
          let matchingNotes: data.CompiledNotes;
          if (search) {
            // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
            const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            const regexp = RegExp(escaped, 'i');

            function matchesSearch(note: data.Note): boolean {
              if (note.content.mdx && regexp.test(note.content.mdx)) return true;
              if (note.content.json && regexp.test(note.content.json)) return true;
              if (note.content.txt && regexp.test(note.content.txt)) return true;
              if (regexp.test(note.tag)) return true;
              if (note.meta.tags && note.meta.tags.some(regexp.test)) return true;
              return false;
            }
            const matches = notes.filter(matchesSearch);
            matchingNotes = matches.withMutations(map => {
              matches.forEach((_, tag) => {
                const dirname = Path.dirname(tag);
                if (dirname != '.') {
                  const dirs = dirname.split('/');
                  let dir = '';
                  for (let i=0; i < dirs.length; i++) {
                    dir = Path.join(dir, dirs[i]);
                    if (!map.has(dir)) {
                      const note = notes.get(dir) || bug(`expected note for ${dir}`);
                      map.set(dir, note);
                    }
                  }
                }
              });
            });
          } else {
            matchingNotes = notes;
          }
          return matchingNotes.valueSeq().toArray().sort((a, b) =>
            a.tag < b.tag ? -1 : 1
          );
        })
      })
    );
  public get matchingNotes() { return this.matchingNotesSignal.get() }

  private dirExpandedCell = Signal.cellOk(Immutable.Map<string, boolean>(), this.dirtyAndRender);
  public toggleDirExpanded = (dir: string) => {
    this.dirExpandedCell.update(dirExpanded => {
      const flag = dirExpanded.get(dir, false);
      return dirExpanded.set(dir, !flag);
    });
  }

  private matchingNotesTreeSignal = Signal.label('matchingNotesTree',
    Signal.join(
      this.matchingNotesSignal,
      this.dirExpandedCell,
      this.selectedCell
    ).map(([matchingNotes, dirExpanded, selected]) => {
      const matchingNotesTree: Array<data.CompiledNote & { indent: number, expanded?: boolean }> = [];
      matchingNotes.forEach(note => {
        const dirname = Path.dirname(note.tag);
        let showNote = true;
        let indent = 0;
        if (dirname !== '.') {
          const dirs = dirname.split('/');
          indent = dirs.length;
          let dir = '';
          for (let i = 0; i < dirs.length; i++) {
            dir = Path.join(dir, dirs[i]);
            if (!dirExpanded.get(dir, false)) showNote = false;
          }
          if (selected && selected.startsWith(note.tag))
            showNote = true;
        }
        if (showNote) {
          let expanded: boolean | undefined = undefined;
          if (note.isIndex) {
            expanded = dirExpanded.get(note.tag, false);
          }
          matchingNotesTree.push({ ...note, indent, expanded });
        }
      });
      return matchingNotesTree;
    })
  );
  public get matchingNotesTree() { return this.matchingNotesTreeSignal.get() }

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

  private nextProblem = () => {
    const selected = this.selected;
    const matchingNotes = this.matchingNotes;
    const nextIndex = matchingNotes.findIndex(note => note.tag === selected) + 1;
    let cont = true;
    for (let i = 0; cont && i < matchingNotes.length; i++) {
      const index = (nextIndex + i) % matchingNotes.length;
      const matchingNote = matchingNotes[index];
      // TODO(jaked) separate selectable content objects in notes?
      Object.values(matchingNote.compiled).forEach(compiled => {
        if (compiled?.type === 'err') {
          cont = false;
          this.setSelected(matchingNote.tag);
        }
      });
    }
  }

  private previousProblem = () => {
    const selected = this.selected;
    const matchingNotes = this.matchingNotes;
    const previousIndex = matchingNotes.findIndex(note => note.tag === selected) - 1;
    let cont = true;
    for (let i = matchingNotes.length - 1; cont && i > 0; i--) {
      const index = (previousIndex + i) % matchingNotes.length;
      const matchingNote = matchingNotes[index];
      // TODO(jaked) separate selectable content objects in notes?
      Object.values(matchingNote.compiled).forEach(compiled => {
        if (compiled?.type === 'err') {
          cont = false;
          this.setSelected(matchingNote.tag);
        }
      });
    }
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
      // TODO(jaked) handle jpegs
      // if (note.type === 'jpeg') {
      //   const notePath = Path.resolve(tempdir, note.path);
      //   await mkdir(Path.dirname(notePath), { recursive: true });
      //   await writeFile(notePath, note.buffer);
      // } else if (note.type === 'table') {
      //   // ???
      const notePath = Path.resolve(tempdir, note.tag) + '.html';
      let node;
      Object.values(note.compiled).forEach(compiled => {
        compiled?.forEach(compiled => {
          node = compiled.rendered.get(); // TODO(jaked) fix Try.get()
        });
      })
      if (!node) return;
      const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
      await mkdir(Path.dirname(notePath), { recursive: true });
      await writeFile(notePath, html);
    }).values());
    if (false) {
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
