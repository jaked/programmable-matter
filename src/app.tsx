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
    this.setContentAndSessionSignal.reconcile(this.__trace, this.level);

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
        // TODO(jaked) fix hack
        const matchingNotesTree = this.matchingNotesTreeSignal.get();
        matchingNotesTree.forEach(matchingNote =>
          Object.values(matchingNote.compiled).forEach(compiled => {
            if (!compiled) return;
            compiled.reconcile(this.__trace, this.level);
          })
        )

        this.compiledNoteSignal.reconcile(this.__trace, this.level);
        // TODO(jaked) fix hack
        const compiledNote = this.compiledNoteSignal.get();
        if (compiledNote) {
          Object.values(compiledNote.compiled).forEach(compiled => {
            if (!compiled) return;
            compiled.reconcile(this.__trace, this.level);
            compiled.value.forEach(compiled => compiled.rendered.reconcile(this.__trace, this.level));
          });
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

  public focusDirCell = Signal.cellOk<string | null>(null, this.dirtyAndRender);
  public get focusDir() { return this.focusDirCell.get() }
  public setFocusDir = (focus: string | null) => {
    this.focusDirCell.setOk(focus);
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

    const note = this.notesSignal.get().get(selected);
    if (!note) return;

    Object.values(note.files).forEach(file => {
      if (!file) return;
      this.filesystem.delete(file.get().path);
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

  private notesSignal =
    Compile.notesOfFiles(this.__trace, this.filesystem.files);

  private compiledNotesSignal =
    Compile.compileNotes(
      this.__trace,
      this.notesSignal,
      this.filesystem.update,
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
        if (selected !== null) {
          const note = notes.get(selected);
          if (note) {
            let viewContent: [data.Types, Signal<string>] | null = null;
            const editorViewContent = note.content[editorView];
            if (editorViewContent) viewContent = [editorView, editorViewContent];
            else if (note.content.mdx) viewContent = ['mdx', note.content.mdx];
            else if (note.content.json) viewContent = ['json', note.content.json];
            else if (note.content.txt) viewContent = ['txt', note.content.txt];
            else if (note.content.meta) viewContent = ['meta', note.content.meta];
            if (viewContent) {
              const [view, content] = viewContent;
              return content.map(content => [view, content]);
            }
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

  private setContentAndSessionSignal =
    Signal.join(
      this.selectedCell,
      this.viewSignal,
      this.sessionsCell,
      this.notesSignal,
    ).flatMap(([selected, view, sessions, notes]) => {
      const noop = Signal.ok((updateContent: string, session: Session) => {});
      if (!selected || !view) return noop;
      const note = notes.get(selected);
      if (!note) return noop;
      return Signal.join<string, data.File>(note.content[view], note.files[view]).map(([content, file]) =>
        (updateContent: string, session: Session) => {
          this.sessionsCell.setOk(sessions.set(selected, session));
          if (updateContent === content) return; // TODO(jaked) still needed?
          this.filesystem.update(file.path, Buffer.from(updateContent, 'utf8'));
        }
      );
    });
  public get setContentAndSession() { return this.setContentAndSessionSignal.get() }

  private matchingNotesSignal =
    Signal.label('matchingNotes',
      Signal.join(
        // TODO(jaked)
        // map matching function over individual note signals
        // so we only need to re-match notes that have changed
        this.compiledNotesSignal,
        this.focusDirCell,
        this.searchCell
      ).flatMap(([notes, focusDir, search]) => {

        let focusDirNotes: data.CompiledNotes;
        if (focusDir) {
          focusDirNotes = notes.filter((_, tag) => tag.startsWith(focusDir + '/'))
        } else {
          focusDirNotes = notes;
        }

        let matchingNotes: Signal<data.CompiledNotes>;
        if (search) {
          // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
          const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
          const regexp = RegExp(escaped, 'i');

          function matchesSearch(note: data.CompiledNote): Signal<[boolean, data.CompiledNote]> {
            return Signal.join(
              note.content.mdx ? note.content.mdx.map(mdx => regexp.test(mdx)) : Signal.ok(false),
              note.content.json ? note.content.json.map(json => regexp.test(json)) : Signal.ok(false),
              note.content.txt ? note.content.txt.map(txt => regexp.test(txt)) : Signal.ok(false),
              note.meta.map(meta => !!(meta.tags && meta.tags.some(tag => regexp.test(tag)))),
              Signal.ok(regexp.test(note.tag)),
            ).map(bools => [bools.some(bool => bool), note])
          }
          // TODO(jaked) wrap this up in a function on Signal
          const matches =
            Signal.joinImmutableMap(Signal.ok(focusDirNotes.map(matchesSearch)))
              .map(map => map.filter(([bool, note]) => bool).map(([bool, note]) => note));

          // include parents of matching notes
          matchingNotes = matches.map(matches => matches.withMutations(map => {
            matches.forEach((_, tag) => {
              if (focusDir) {
                tag = Path.relative(focusDir, tag);
              }
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
          }));
        } else {
          matchingNotes = Signal.ok(focusDirNotes);
        }

        return matchingNotes.map(matchingNotes => matchingNotes.valueSeq().toArray().sort((a, b) =>
          a.tag < b.tag ? -1 : 1
        ));
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
      this.selectedCell,
      this.focusDirCell
    ).map(([matchingNotes, dirExpanded, selected, focusDir]) => {
      const matchingNotesTree: Array<data.CompiledNote & { indent: number, expanded?: boolean }> = [];
      matchingNotes.forEach(note => {
        // TODO(jaked) this code is bad
        let tag = note.tag;
        if (focusDir) {
          tag = Path.relative(focusDir, tag);
        }
        const dirname = Path.dirname(tag);
        let showNote = true;
        let indent = 0;
        if (dirname !== '.') {
          const dirs = dirname.split('/');
          indent = dirs.length;
          let dir = '';
          for (let i = 0; i < dirs.length; i++) {
            dir = Path.join(dir, dirs[i]);
            if (focusDir) {
              dir = Path.join(focusDir, dir);
            }
            if (!dirExpanded.get(dir, false)) showNote = false;
          }
          if (selected && selected.startsWith(note.tag))
            showNote = true;
        }
        if (focusDir) indent += 1;
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
        if (!compiled) return;
        if (compiled.value.type === 'err') {
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
        if (!compiled) return;
        if (compiled.value.type === 'err') {
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
      // TODO(jaked) render whole note
      Object.values(note.compiled).forEach(compiled => {
        if (!compiled) return;
        // TODO(jaked) don't blow up on failed notes
        node = compiled.get().rendered.get();
      });
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
