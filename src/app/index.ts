import * as fs from "fs";
import * as Path from 'path';
import * as process from 'process';
import { ipcRenderer as ipc } from 'electron';
import JSON5 from 'json5';

import * as model from '../model';
import * as PMAST from '../model/PMAST';
import * as Meta from '../model/Meta';
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

const emptyBuffer = Buffer.from('');

function typeOfPath(path: string): model.Types {
  const ext = Path.parse(path).ext;
  switch (ext) {
    case '.meta': return 'meta';
    case '.pm': return 'pm';
    case '.json': return 'json';
    case '.table': return 'table';
    case '.jpeg': return 'jpeg';
    case '.png': return 'png';
    case '.xml': return 'xml';
    default:
      throw new Error(`unhandled extension '${ext}' for '${path}'`);
  }
}

export class App {
  private files = Signal.cellOk<model.Files>(new Map());

  // TODO(jaked) break versioning out to a separate module
  private filesVersions: model.Files[] = [];
  private filesVersionIndex = -1; // index of the current version
  private filesWithVersions = this.files.mapInvertible(
    files => files,
    files => {
      this.filesVersionIndex += 1;
      this.filesVersions.splice(this.filesVersionIndex);
      this.filesVersions.push(files);
      return files;
    },
    true // eager
  )

  private filesystem = Filesystem(process.argv[process.argv.length - 1], this.filesWithVersions);

  constructor() {
    this.render();

    // TODO(jaked) do we need to remove these somewhere?
    ipc.on('focus-search-box', () => this.mainRef.current && this.mainRef.current.focusSearchBox());
    ipc.on('toggle-sidebar-visible', this.toggleSidebarVisible);
    ipc.on('set-main-pane-view', (_, view: 'code' | 'display' | 'split') => {
      this.setMainPaneView(view)
    });
    ipc.on('history-back', this.historyBack);
    ipc.on('history-forward', this.historyForward);
    ipc.on('global-undo', this.globalUndo);
    ipc.on('global-redo', this.globalRedo);
    ipc.on('previous-problem', this.previousProblem);
    ipc.on('next-problem', this.nextProblem);

    ipc.on('delete-note', this.deleteNote);

    ipc.on('publish-site', this.publishSite);
    ipc.on('sync-google-tasks', this.syncGoogleTasks);

    ipc.on('focus', () => this.filesystem.start());
    ipc.on('blur', () => this.filesystem.stop());

    ipc.on('set-data-dir', async (_, path: string) => {
      await this.filesystem.close();
      this.files.setOk(new Map());
      this.filesVersions = [];
      this.filesVersionIndex = -1;
      this.filesystem = Filesystem(path, this.filesWithVersions);
    });

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

  private setFiles(filesVersion: model.Files) {
    const mtimeMs = Date.now();
    const files: model.Files = new Map();
    filesVersion.forEach((file, path) => {
      files.set(path, { ...file, mtimeMs });
    });
    for (const path of this.filesystem.fsPaths()) {
      if (!filesVersion.has(path)) {
        files.set(path, { deleted: true, mtimeMs, buffer: emptyBuffer })
      }
    }
    this.files.setOk(files);
  }

  private globalUndo = () => {
    if (this.filesVersionIndex > 0) {
      this.filesVersionIndex -= 1;
      this.setFiles(this.filesVersions[this.filesVersionIndex]);
    }
  }

  private globalRedo = () => {
    if (this.filesVersionIndex < this.filesVersions.length - 1) {
      this.filesVersionIndex += 1;
      this.setFiles(this.filesVersions[this.filesVersionIndex]);
    }
  }

  private historyBack = () => {
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
  private historyForward = () => {
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

  deleteNote = () => {
    const selected = this.selectedCell.get();
    this.setSelected(null);
    if (selected === null) return;

    const note = this.compiledNotesSignal.get().get(selected);
    if (!note) return;

    Object.values(note.files).forEach(file => {
      if (!file) return;
      this.filesystem.remove(file.path);
    });
  }

  private contents = Signal.mapMap(
    Signal.splitMapWritable(
      Signal.filterMapWritable(
        this.filesWithVersions,
        file => !file.deleted
      )
    ),
    (file, path) => {
      const type = typeOfPath(path);

      const mtimeMs = file.map(({ mtimeMs }) => mtimeMs);
      const buffer = file.mapInvertible(
        ({ buffer }) => buffer,
        buffer => ({ buffer, mtimeMs: Date.now(), deleted: false })
      );

      let content: Signal.Writable<unknown>;
      switch (type) {
        case 'pm':
          content = buffer.mapInvertible(
            // TODO(jaked) handle parse / validate errors
            buffer => {
              const obj = JSON5.parse(buffer.toString('utf8'));
              if (Array.isArray(obj)) {
                PMAST.validateNodes(obj);
                return {
                  nodes: obj,
                  meta: {},
                };
              } else {
                PMAST.validateNodes(obj.nodes);
                return {
                  nodes: obj.nodes,
                  meta: Meta.validate(obj.meta)
                }
              }
            },
            obj => Buffer.from(JSON5.stringify(obj, undefined, 2), 'utf8')
          );
          break;

        case 'jpeg':
          content = buffer;
          break;

        case 'png':
          content = buffer;
          break;

        default:
          content = buffer.mapInvertible(
            buffer => buffer.toString('utf8'),
            string => Buffer.from(string, 'utf8')
          );
      }
      return { type, path, mtimeMs, content };
    }
  );

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
        pm: false, meta: false, table: false, json: false,
      });

      const name = compiledNote.name;
      function problems(type: model.Types) {
        return compiledFiles.get(Name.pathOfName(name, type))?.problems ?? Signal.ok(false);
      }
      // TODO(jaked) pass these on note instead of reconstructing
      return Signal.join(
        problems('pm'),
        problems('meta'),
        problems('table'),
        problems('json'),
      ).map(([pm, meta, table, json]) => ({
        pm, meta, table, json
      }));
    });

  public selectedFileSignal =
    Signal.join(
      this.compiledNoteSignal,
      this.contents,
    ).map(([compiledNote, files]) => {
      if (compiledNote) {
        const path = Name.pathOfName(compiledNote.name, compiledNote.type);
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

  private sessionsCell = Signal.cellOk<Map<string, Session>>(new Map());
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
    this.selectedFileSignal.map(file => {
      const noop = (session: Session) => {};
      if (!file) return noop;
      return (session: Session) => {
        this.sessionsCell.produce(sessions => { sessions.set(file.path, session) });
      };
    })
  );

  private server =
    new Server(this.compiledNotesSignal);

  private mainRef = React.createRef<Main>();

  private render = () => {
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
