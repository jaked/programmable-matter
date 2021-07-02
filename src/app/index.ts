import * as fs from "fs";
import * as Path from 'path';
import * as process from 'process';
import { ipcRenderer as ipc } from 'electron';

import { bug } from '../util/bug';
import Signal from '../util/Signal';
import * as Name from '../util/Name';

import Server from '../server';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import Main from '../components/Main';
import { Session, emptySession } from '../components/react-simple-code-editor';

import * as GTasks from '../integrations/gtasks';

import ghPages from '../publish/ghPages';

import * as Files from './files';
import * as Contents from './contents';
import * as EditName from './editName';
import * as SelectedNote from './selectedNote';
import * as Compiled from './compiled';
import * as Sidebar from './sidebar';

import mkNewNote from './newNote';

const debug = false;

export const mouseSignal = Signal.cellOk({ clientX: 0, clientY: 0 });

export const sideBarVisibleCell = Signal.cellOk<boolean>(true);
const toggleSidebarVisible = () => {
  sideBarVisibleCell.update(b => !b);
};

export const mainPaneViewCell = Signal.cellOk<'code' | 'display' | 'split'>('split');
const setMainPaneView = (view: 'code' | 'display' | 'split') => {
  mainPaneViewCell.setOk(view);
}

const deleteNote = () => {
  const selected = SelectedNote.selectedCell.get();
  SelectedNote.setSelected(null);
  if (selected === null) return;

  const note = Compiled.compiledNotesSignal.get().get(selected);
  if (!note) return;

  Object.values(note.files).forEach(file => {
    if (!file) return;
    Files.filesystem.remove(file.path);
  });
}

export const setNameSignal = Compiled.compiledNoteSignal.map(compiledNote => {
  if (compiledNote === null) return (name: string) => {};
  else return (name: string) => {
    name = Name.normalize(name);
    Object.values(compiledNote.files).forEach(file => {
      if (!file) return;
      const pathParsed = Path.parse(file.path);
      const newParsed = { ...pathParsed, base: undefined, dir: Name.dirname(name), name: Name.basename(name) };
      const newPath = Path.format(newParsed);
      Files.filesystem.rename(file.path, newPath);
    });
    SelectedNote.setSelected(name);
  };
});

export const onNewNoteSignal = mkNewNote({
  fsUpdate: Files.filesystem.update,
  notes: Files.filesByNameSignal,
  focusDir: Sidebar.focusDirCell,
  callback: (name: string) => {
    SelectedNote.setSelected(name);
    EditName.setEditName(name);
  }
});

export const selectedFileSignal =
  Signal.join(
    Compiled.compiledNoteSignal,
    Contents.contents,
  ).map(([compiledNote, contents]) => {
    if (compiledNote) {
      const path = Name.pathOfName(compiledNote.name, compiledNote.type);
      const file = contents.get(path);
      if (file) return file;
    }
    return null;
  });

export const compiledFileSignal = Signal.label('compiledFile',
  Signal.join(selectedFileSignal, Compiled.compiledFilesSignal).map(([file, compiledFiles]) => {
    if (file) {
      const compiledFile = compiledFiles.get(file.path) ?? bug(`expected compiled file for ${file.path}`);
      return compiledFile;
    }
    return null;
  })
);

const sessionsCell = Signal.cellOk<Map<string, Session>>(new Map());
export const sessionSignal = Signal.label('session',
  Signal.join(selectedFileSignal, sessionsCell).map(([file, sessions]) => {
    if (file) {
      const session = sessions.get(file.path);
      if (session) {
        return session;
      }
    }
    return emptySession();
  })
);

export const setSessionSignal = Signal.label('setSession',
  selectedFileSignal.map(file => {
    const noop = (session: Session) => {};
    if (!file) return noop;
    return (session: Session) => {
      sessionsCell.produce(sessions => { sessions.set(file.path, session) });
    };
  })
);

const server =
  new Server(Compiled.compiledNotesSignal);

const mainRef = React.createRef<Main>();

const nextProblem = () => {
  // TODO(jaked)
  // const nextIndex = matchingNotes.findIndex(note => note.name === selected) + 1;
  // let cont = true;
  // for (let i = 0; cont && i < matchingNotes.length; i++) {
  //   const index = (nextIndex + i) % matchingNotes.length;
  //   const matchingNote = matchingNotes[index];
  //   // TODO(jaked) separate selectable content objects in notes?
  //   if (matchingNote.problems.get() === true) {
  //     cont = false;
  //     setSelected(matchingNote.name);
  //   }
  // }
}

const previousProblem = () => {
  // TODO(jaked)
  // const previousIndex = matchingNotes.findIndex(note => note.name === selected) - 1;
  // let cont = true;
  // for (let i = matchingNotes.length - 1; cont && i > 0; i--) {
  //   const index = (previousIndex + i) % matchingNotes.length;
  //   const matchingNote = matchingNotes[index];
  //   // TODO(jaked) separate selectable content objects in notes?
  //   if (matchingNote.problems.get() === true) {
  //     cont = false;
  //     setSelected(matchingNote.name);
  //   }
  // }
}

const publishSite = async () => {
  const compiledNotes = Compiled.compiledNotesSignal.get();
  ghPages(compiledNotes);
}

const syncGoogleTasks = () => {
  // TODO(jaked) should do this via Filesystem object
  // not via direct filesystem accesss
  const filesPath = fs.realpathSync(Path.resolve(process.cwd(), 'docs'));
  GTasks.authAndSyncTaskLists(filesPath);
}

// TODO(jaked) do we need to remove these somewhere?
ipc.on('focus-search-box', () => mainRef.current && mainRef.current.focusSearchBox());
ipc.on('toggle-sidebar-visible', toggleSidebarVisible);
ipc.on('set-main-pane-view', (_, view: 'code' | 'display' | 'split') => {
  setMainPaneView(view)
});
ipc.on('history-back', SelectedNote.historyBack);
ipc.on('history-forward', SelectedNote.historyForward);
ipc.on('global-undo', Files.globalUndo);
ipc.on('global-redo', Files.globalRedo);
ipc.on('previous-problem', previousProblem);
ipc.on('next-problem', nextProblem);

ipc.on('delete-note', deleteNote);

ipc.on('publish-site', publishSite);
ipc.on('sync-google-tasks', syncGoogleTasks);

ipc.on('focus', () => Files.filesystem.start());
ipc.on('blur', () => Files.filesystem.stop());

ipc.on('set-data-dir', (_, path: string) => { Files.setPath(path) });

document.onmousemove = (e: MouseEvent) => {
  mouseSignal.setOk({ clientX: e.clientX, clientY: e.clientY });
}

ReactDOM.render(
  React.createElement(Main, { ref: mainRef }),
  document.getElementById('main')
);
