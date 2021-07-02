import * as Name from '../util/Name';
import Signal from '../util/Signal';
import * as Files from './files';
import * as EditName from './editName';

let history: string[] = [];
let historyIndex: number = -1; // index of current selection, or -1 if none
export const selectedCell = Signal.cellOk<string | null>(null);

function rewriteName(name: string | null): string | null {
  if (name === null) return null;
  const noteNames = Files.filesByNameSignal.get();
  return Name.rewrite(noteNames, name);
}

export const setSelected = (selected: string | null) => {
  selected = rewriteName(selected);
  if (selected === selectedCell.get()) return;
  if (selected !== null) {
    history = history.slice(0, historyIndex + 1);
    history.push(selected);
    historyIndex++;
  }
  selectedCell.setOk(selected);
  EditName.setEditName(undefined);
}

export const maybeSetSelected = (selected: string | null): boolean => {
  selected = rewriteName(selected);
  if (selected === null) return false;
  else {
    setSelected(selected);
    return true;
  }
}

export const historyBack = () => {
  const noteNames = Files.filesByNameSignal.get();
  const selected = selectedCell.get();
  let newIndex = historyIndex;
  // skip history entries of deleted notes
  while (newIndex >= 0 && (history[newIndex] === selected || !noteNames.has(history[newIndex])))
    newIndex--;
  if (newIndex >= 0 && newIndex < history.length) {
    historyIndex = newIndex;
    selectedCell.setOk(history[newIndex]);
    EditName.setEditName(undefined);
  }
}

export const historyForward = () => {
  const noteNames = Files.filesByNameSignal.get();
  const selected = selectedCell.get();
  let newIndex = historyIndex;
  // skip history entries of deleted notes
  while (newIndex < history.length && (history[newIndex] === selected || !noteNames.has(history[newIndex])))
    newIndex++;
  if (newIndex >= 0 && newIndex < history.length) {
    historyIndex = newIndex;
    selectedCell.setOk(history[newIndex]);
    EditName.setEditName(undefined);
  }
}
