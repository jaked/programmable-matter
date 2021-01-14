import * as fs from "fs";
import * as Path from 'path';
import * as process from 'process';
import { ipcRenderer as ipc } from 'electron';

import * as Immutable from 'immutable';

import * as data from '../data';
import * as PMAST from '../PMAST';
import { bug } from '../util/bug';
import Signal from '../util/Signal';
import * as Name from '../util/Name';
import Filesystem from '../files/Filesystem';

import * as Compile from '../lang/Compile';

import Server from '../server';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import Main from '../components/Main';
import { Session, emptySession } from '../components/react-simple-code-editor';

import * as GTasks from '../integrations/gtasks';

import ghPages from '../publish/ghPages';

import mkNewNote from './newNote';

const debug = false;

export class App {
  private render = () => {
    // TODO(jaked)
    // need to trigger BrowserSync reload on changes
    // this.server.reconcile();

    this.reactRender();
  }

  private filesystem = Filesystem();

  constructor() {
    this.render();

    // TODO(jaked) do we need to remove these somewhere?
    ipc.on('focus-search-box', () => this.mainRef.current && this.mainRef.current.focusSearchBox());
    ipc.on('toggle-sidebar-visible', this.toggleSidebarVisible);
    ipc.on('set-main-pane-view', (_, view: 'code' | 'display' | 'split') => {
      this.setMainPaneView(view)
    });
    ipc.on('set-editor-view', (_, view: 'pm' | 'mdx' | 'json' | 'table' | 'meta') => {
      this.setEditorView(view)
    });
    ipc.on('history-back', this.historyBack);
    ipc.on('history-forward', this.historyForward);
    ipc.on('previous-problem', this.previousProblem);
    ipc.on('next-problem', this.nextProblem);

    ipc.on('delete-note', this.deleteNote);

    ipc.on('publish-site', this.publishSite);
    ipc.on('sync-google-tasks', this.syncGoogleTasks);

    ipc.on('focus', () => this.filesystem.start());
    ipc.on('blur', () => this.filesystem.stop());

    ipc.on('set-data-dir', (_, path: string) => this.filesystem.setPath(path));

    document.onmousemove = (e: MouseEvent) => {
      this.mouseSignal.setOk({ clientX: e.clientX, clientY: e.clientY });
    }
  }

  public mouseSignal = Signal.cellOk({ clientX: 0, clientY: 0 });

  public editNameCell = Signal.cellOk<string | undefined>(undefined);
  public setEditName = (editName: string | undefined) => this.editNameCell.setOk(editName)

  private history: string[] = [];
  private historyIndex: number = -1; // index of current selection, or -1 if none
  public selectedCell = Signal.cellOk<string | null>(null);

  // TODO(jaked)
  // selection + history needs its own module + tests

  private rewriteName(name: string | null): string | null {
    if (name === null) return null;
    const compiledNotes = this.compiledNotesSignal.get();
    return Name.rewrite(compiledNotes, name);
  }

  public setSelected = (selected: string | null) => {
    selected = this.rewriteName(selected);
    if (selected === this.selectedCell.get()) return;
    if (selected !== null) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(selected);
      this.historyIndex++;
    }
    this.selectedCell.setOk(selected);
    this.setEditName(undefined);
  }

  public maybeSetSelected = (selected: string | null): boolean => {
    selected = this.rewriteName(selected);
    if (selected === null) return false;
    else {
      this.setSelected(selected);
      return true;
    }
  }

  public historyBack = () => {
    const notes = this.compiledNotesSignal.get();
    const selected = this.selectedCell.get();
    let newIndex = this.historyIndex;
    // skip history entries of deleted notes
    while (newIndex >= 0 && (this.history[newIndex] === selected || !notes.has(this.history[newIndex])))
     newIndex--;
    if (newIndex >= 0 && newIndex < this.history.length) {
      this.historyIndex = newIndex;
      this.selectedCell.setOk(this.history[newIndex]);
      this.setEditName(undefined);
    }
  }
  public historyForward = () => {
    const notes = this.compiledNotesSignal.get();
    const selected = this.selectedCell.get();
    let newIndex = this.historyIndex;
    // skip history entries of deleted notes
    while (newIndex < this.history.length && (this.history[newIndex] === selected || !notes.has(this.history[newIndex])))
     newIndex++;
    if (newIndex >= 0 && newIndex < this.history.length) {
      this.historyIndex = newIndex;
      this.selectedCell.setOk(this.history[newIndex]);
      this.setEditName(undefined);
    }
  }

  public focusDirCell = Signal.cellOk<string | null>(null);
  public setFocusDir = (focus: string | null) => {
    this.focusDirCell.setOk(focus);
  }

  public sideBarVisibleCell = Signal.cellOk<boolean>(true);
  public toggleSidebarVisible = () => {
    this.sideBarVisibleCell.update(b => !b);
  };

  public mainPaneViewCell = Signal.cellOk<'code' | 'display' | 'split'>('split');
  public setMainPaneView = (view: 'code' | 'display' | 'split') => {
    this.mainPaneViewCell.setOk(view);
  }

  public editorViewCell = Signal.cellOk<'pm' | 'mdx' | 'json' | 'table' | 'meta'>('pm');
  public setEditorView = (view: 'pm' | 'mdx' | 'json' | 'table' | 'meta') => {
    this.editorViewCell.setOk(view);
  }

  deleteNote = () => {
    const selected = this.selectedCell.get();
    this.setSelected(null);
    const view = this.editorViewCell.get();
    if (selected === null || !view) return;

    const note = this.compiledNotesSignal.get().get(selected);
    if (!note) return;

    Object.values(note.files).forEach(file => {
      if (!file) return;
      this.filesystem.remove(file.path);
    });
  }

  private contents = Signal.mapImmutableMap(this.filesystem.files, file => {
    const { type, path, mtimeMs } = file;
    let content: Signal.Writable<unknown>;
    switch (type) {
      case 'pm':
        content = file.buffer.mapWritable(
          // TODO(jaked) handle parse errors
          buffer => PMAST.parse(buffer.toString('utf8')),
          nodes => Buffer.from(PMAST.stringify(nodes), 'utf8')
        );
        break;

      case 'jpeg':
        content = file.buffer;
        break;

      default:
        content = file.buffer.mapWritable(
          buffer => buffer.toString('utf8'),
          string => Buffer.from(string, 'utf8')
        );
    }
    return { type, path, mtimeMs, content };
  });

  private compiledFilesSignalNotesSignal =
    Compile.compileFiles(
      this.contents,
      this.filesystem.update,
      this.filesystem.remove,
      this.setSelected,
    )
  private compiledFilesSignal = this.compiledFilesSignalNotesSignal.compiledFiles;
  public compiledNotesSignal = this.compiledFilesSignalNotesSignal.compiledNotes;

  public compiledNoteSignal = Signal.label('compiledNote',
    Signal.join(this.compiledNotesSignal, this.selectedCell).map(([compiledNotes, selected]) => {
      if (selected !== null) {
        const note = compiledNotes.get(selected);
        if (note) return note;
      }
      return null;
    })
  );

  public setNameSignal = this.compiledNoteSignal.map(compiledNote => {
    if (compiledNote === null) return (name: string) => {};
    else return (name: string) => {
      name = Name.normalize(name);
      Object.values(compiledNote.files).forEach(file => {
        if (!file) return;
        const pathParsed = Path.parse(file.path);
        const newParsed = { ...pathParsed, base: undefined, dir: Name.dirname(name), name: Name.basename(name) };
        const newPath = Path.format(newParsed);
        this.filesystem.rename(file.path, newPath);
      });
      this.setSelected(name);
    };
  });

  public onNewNoteSignal = mkNewNote({
    fsUpdate: this.filesystem.update,
    notes: this.compiledNotesSignal,
    focusDir: this.focusDirCell,
    callback: (name: string) => {
      this.setSelected(name);
      this.setEditName(name);
    }
  });

  public selectedNoteProblemsSignal =
    Signal.join(this.compiledFilesSignal, this.compiledNoteSignal).flatMap(([compiledFiles, compiledNote]) => {
      // TODO(jaked)
      // selectedNoteProblemsSignal is reconciled even when compiledNote is null
      // why?
      if (compiledNote === null) return Signal.ok({
        pm: false, meta: false, mdx: false, table: false, json: false,
      });

      const name = compiledNote.name;
      function problems(type: data.Types) {
        return compiledFiles.get(Name.pathOfName(name, type))?.problems ?? Signal.ok(false);
      }
      // TODO(jaked) pass these on note instead of reconstructing
      return Signal.join(
        problems('pm'),
        problems('meta'),
        problems('mdx'),
        problems('table'),
        problems('json'),
      ).map(([pm, meta, mdx, table, json]) => ({
        pm, meta, mdx, table, json
      }));
    });

  public selectedFileSignal =
    Signal.join(
      this.compiledNoteSignal,
      this.editorViewCell,
      this.contents,
    ).map(([compiledNote, view, files]) => {
      if (compiledNote) {
        const path = Name.pathOfName(compiledNote.name, view);
        const file = files.get(path);
        if (file) return file;
      }
      return null;
    });

  public compiledFileSignal = Signal.label('compiledFile',
    Signal.join(this.selectedFileSignal, this.compiledFilesSignal).map(([file, compiledFiles]) => {
      if (file) {
        const compiledFile = compiledFiles.get(file.path) ?? bug(`expected compiled file for ${file.path}`);
        return compiledFile;
      }
      return null;
    })
  );

  private sessionsCell = Signal.cellOk<Immutable.Map<string, Session>>(Immutable.Map());
  public sessionSignal = Signal.label('session',
    Signal.join(this.selectedFileSignal, this.sessionsCell).map(([file, sessions]) => {
      if (file) {
        const session = sessions.get(file.path);
        if (session) {
          return session;
        }
      }
      return emptySession();
    })
  );

  public setSessionSignal = Signal.label('setSession',
    Signal.join(
      this.selectedFileSignal,
      this.sessionsCell,
    ).map(([file, sessions]) => {
      const noop = (session: Session) => {};
      if (!file) return noop;
      return (session: Session) => {
        this.sessionsCell.setOk(sessions.set(file.path, session));
      };
    })
  );

  private server =
    new Server(this.compiledNotesSignal);

  private mainRef = React.createRef<Main>();

  private reactRender = () => {
    ReactDOM.render(
      React.createElement(Main, { ref: this.mainRef, app: this }),
      document.getElementById('main')
    );
  }

  private nextProblem = () => {
    // TODO(jaked)
    // const selected = this.selected;
    // const matchingNotes = this.matchingNotes;
    // const nextIndex = matchingNotes.findIndex(note => note.name === selected) + 1;
    // let cont = true;
    // for (let i = 0; cont && i < matchingNotes.length; i++) {
    //   const index = (nextIndex + i) % matchingNotes.length;
    //   const matchingNote = matchingNotes[index];
    //   // TODO(jaked) separate selectable content objects in notes?
    //   if (matchingNote.problems.get() === true) {
    //     cont = false;
    //     this.setSelected(matchingNote.name);
    //   }
    // }
  }

  private previousProblem = () => {
    // TODO(jaked)
    // const selected = this.selected;
    // const matchingNotes = this.matchingNotes;
    // const previousIndex = matchingNotes.findIndex(note => note.name === selected) - 1;
    // let cont = true;
    // for (let i = matchingNotes.length - 1; cont && i > 0; i--) {
    //   const index = (previousIndex + i) % matchingNotes.length;
    //   const matchingNote = matchingNotes[index];
    //   // TODO(jaked) separate selectable content objects in notes?
    //   if (matchingNote.problems.get() === true) {
    //     cont = false;
    //     this.setSelected(matchingNote.name);
    //   }
    // }
  }

  publishSite = async () => {
    const compiledNotes = this.compiledNotesSignal.get();
    ghPages(compiledNotes);
  }

  syncGoogleTasks = () => {
    // TODO(jaked) should do this via Filesystem object
    // not via direct filesystem accesss
    const filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
    GTasks.authAndSyncTaskLists(filesPath);
  }
}

const app = new App();

