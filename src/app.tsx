import * as fs from "fs";
import * as Path from 'path';
import * as process from 'process';
import { ipcRenderer as ipc } from 'electron';

import * as Immutable from 'immutable';

import { bug } from './util/bug';
import Signal from './util/Signal';
import * as Tag from './util/Tag';
import { Filesystem } from './files/Filesystem';

import * as Compile from './lang/Compile';

import Server from './server';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import Main from './components/Main';
import { Session, emptySession } from './components/react-simple-code-editor';

import * as GTasks from './integrations/gtasks';

import ghPages from './publish/ghPages';

import Unhandled from 'electron-unhandled';

Unhandled();

const debug = false;

export class App {
  public render = () => {
    this.level++;

    // TODO(jaked)
    // we need to reconcile explicitly to trigger BrowserSync reload
    // can this be avoided?
    this.server.reconcile(this.level);

    this.reactRender();
  }

  // TODO(jaked) make this configurable
  private filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
  private filesystem = new Filesystem(this.filesPath, this.render);

  constructor() {
    this.render();

    this.filesystem.start(); // TODO(jaked) stop this on shutdown

    // TODO(jaked) do we need to remove these somewhere?
    ipc.on('focus-search-box', () => this.mainRef.current && this.mainRef.current.focusSearchBox());
    ipc.on('toggle-sidebar-visible', this.toggleSidebarVisible);
    ipc.on('set-main-pane-view', (_, view: 'code' | 'display' | 'split') => {
      this.setMainPaneView(view)
    });
    ipc.on('set-editor-view', (_, view: 'mdx' | 'json' | 'table' | 'meta') => {
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
  public selectedCell = Signal.cellOk<string | null>(null, this.render);
  public setSelected = (selected: string | null) => {
    if (selected === this.selectedCell.get()) return;
    if (selected !== null) {
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

  public statusCell = Signal.cellOk<string | undefined>(undefined, this.render);
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

  public editorViewCell = Signal.cellOk<'mdx' | 'json' | 'table' | 'meta'>('mdx', this.render);
  public setEditorView = (view: 'mdx' | 'json' | 'table' | 'meta') => {
    this.editorViewCell.setOk(view);
  }

  deleteNote = () => {
    const selected = this.selectedCell.get();
    const view = this.editorViewCell.get();
    if (selected === null || !view) return;

    const note = this.compiledNotesSignal.get().get(selected);
    if (!note) return;

    Object.values(note.files).forEach(file => {
      if (!file) return;
      this.filesystem.delete(file.path);
    });
  }

  public newNote = (tag: string) => {
    this.filesystem.update(tag, Buffer.from('', 'utf8'));
  }

  private compiledFilesSignalNotesSignal =
    Compile.compileFiles(
      this.filesystem.files,
      this.filesystem.update,
      this.filesystem.delete,
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

  public selectedNoteProblemsSignal =
    Signal.join(this.compiledFilesSignal, this.compiledNoteSignal).flatMap(([compiledFiles, compiledNote]) => {
      if (compiledNote !== null) {
        // TODO(jaked) pass these on note instead of reconstructing
        const meta = compiledFiles.get(Tag.pathOfTag(compiledNote.tag, compiledNote.isIndex, 'meta')) ?? Signal.ok(undefined);
        const mdx = compiledFiles.get(Tag.pathOfTag(compiledNote.tag, compiledNote.isIndex, 'mdx')) ?? Signal.ok(undefined);
        const table = compiledFiles.get(Tag.pathOfTag(compiledNote.tag, compiledNote.isIndex, 'table')) ?? Signal.ok(undefined);
        const json = compiledFiles.get(Tag.pathOfTag(compiledNote.tag, compiledNote.isIndex, 'json')) ?? Signal.ok(undefined);
        return Signal.join(meta, mdx, table, json).map(([meta, mdx, table, json]) => ({
          meta: meta?.problems,
          mdx: mdx?.problems,
          table: table?.problems,
          json: json?.problems,
        }));
      } else {
        // TODO(jaked) figure out a way to have signals demanded conditionally
        return Signal.ok({ meta: false, mdx: false, table: false, json: false });
      }
    });

  private selectedFileSignal =
    Signal.join(
      this.compiledNoteSignal,
      this.editorViewCell,
      this.filesystem.files,
    ).map(([compiledNote, view, files]) => {
      if (compiledNote) {
        const path = Tag.pathOfTag(compiledNote.tag, compiledNote.isIndex, view);
        const file = files.get(path);
        if (file) return file;
      }
      return null;
    });

  public compiledFileSignal = Signal.label('compiledFile',
    Signal.join(this.selectedFileSignal, this.compiledFilesSignal).flatMap(([file, compiledFiles]) => {
      if (file) {
        const compiledFile = compiledFiles.get(file.path) ?? bug(`expected compiled file for ${file.path}`);
        return compiledFile;
      }
      return Signal.ok(null);
    })
  );

  // TODO(jaked) bundle data we need for editor in CompiledFile
  public contentSignal: Signal<string | null> =
    this.selectedFileSignal.flatMap(file => {
      if (file) return file.content;
      else return Signal.ok(null);
    });

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

  public setContentAndSessionSignal = Signal.label('setContentAndSession',
    Signal.join(
      this.selectedFileSignal,
      this.sessionsCell,
      this.filesystem.files,
    ).flatMap(([file, sessions, files]) => {
      const noop = Signal.ok((updateContent: string, session: Session) => {});
      if (!file) return noop;
      return file.content.map(content =>
        (updateContent: string, session: Session) => {
          this.sessionsCell.setOk(sessions.set(file.path, session));
          if (updateContent === content) return; // TODO(jaked) still needed?
          this.filesystem.update(file.path, Buffer.from(updateContent, 'utf8'));
        }
      );
    })
  );

  private server =
    new Server(this.compiledNotesSignal);

  private mainRef = React.createRef<Main>();
  private level = 0;

  private reactRender = () => {
    ReactDOM.render(
      <Signal.level.Provider value={this.level}>
        <Main
          ref={this.mainRef}
          app={this}
        />
      </Signal.level.Provider>,
      document.getElementById('main')
    );
  }

  private nextProblem = () => {
    // TODO(jaked)
    // const selected = this.selected;
    // const matchingNotes = this.matchingNotes;
    // const nextIndex = matchingNotes.findIndex(note => note.tag === selected) + 1;
    // let cont = true;
    // for (let i = 0; cont && i < matchingNotes.length; i++) {
    //   const index = (nextIndex + i) % matchingNotes.length;
    //   const matchingNote = matchingNotes[index];
    //   // TODO(jaked) separate selectable content objects in notes?
    //   if (matchingNote.problems.get() === true) {
    //     cont = false;
    //     this.setSelected(matchingNote.tag);
    //   }
    // }
  }

  private previousProblem = () => {
    // TODO(jaked)
    // const selected = this.selected;
    // const matchingNotes = this.matchingNotes;
    // const previousIndex = matchingNotes.findIndex(note => note.tag === selected) - 1;
    // let cont = true;
    // for (let i = matchingNotes.length - 1; cont && i > 0; i--) {
    //   const index = (previousIndex + i) % matchingNotes.length;
    //   const matchingNote = matchingNotes[index];
    //   // TODO(jaked) separate selectable content objects in notes?
    //   if (matchingNote.problems.get() === true) {
    //     cont = false;
    //     this.setSelected(matchingNote.tag);
    //   }
    // }
  }

  publishSite = async () => {
    this.compiledNotesSignal.reconcile(this.level);
    const compiledNotes = this.compiledNotesSignal.get();
    ghPages(compiledNotes, this.level);
  }

  syncGoogleTasks = () => {
    // TODO(jaked) should do this via Filesystem object
    // not via direct filesystem accesss
    const filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
    GTasks.authAndSyncTaskLists(filesPath);
  }
}

const app = new App();
