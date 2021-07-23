import Signal from '../util/Signal';

type Focus =
  null | 'searchbox' | 'notes' | 'editor' | 'titlebar'

export const focusCell = Signal.cellOk<Focus>('searchbox');

export const focus: Signal<Focus> = focusCell;

export const focusSearchbox = () => {
  focusCell.setOk('searchbox');
}

export const searchboxFocused =
  focusCell.map(focus => focus === 'searchbox', true)

export const focusNotes = () => {
  focusCell.setOk('notes');
}

export const notesFocused =
  focusCell.map(focus => focus === 'notes', true)

export const focusEditor = () => {
  focusCell.setOk('editor');
}

export const editorFocused =
  focusCell.map(focus => focus === 'editor', true)

export const focusTitlebar = () => {
  focusCell.setOk('titlebar');
}

export const titlebarFocused =
  focusCell.map(focus => focus === 'titlebar', true)
