import Signal from '../util/Signal';
import * as Compile from '../lang/Compile';

import * as Files from './files';
import * as Contents from './contents';
import * as SelectedNote from './selectedNote';

const compiledFilesSignalNotesSignal =
  Compile.compileFiles(
    Contents.contents,
    Files.filesystem.update,
    Files.filesystem.remove,
    SelectedNote.setSelected,
  )
export const compiledFilesSignal = compiledFilesSignalNotesSignal.compiledFiles;
export const compiledNotesSignal = compiledFilesSignalNotesSignal.compiledNotes;

export const compiledNoteSignal = Signal.label('compiledNote',
  Signal.join(compiledNotesSignal, SelectedNote.selectedNote).map(([compiledNotes, selected]) => {
    if (selected !== null) {
      const note = compiledNotes.get(selected);
      if (note) return note;
    }
    return null;
  })
);
