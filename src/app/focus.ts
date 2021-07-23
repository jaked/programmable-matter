import Signal from '../util/Signal';

type Focus =
  null | 'searchbox' | 'notes' | 'editor' | 'titlebar'

export const focus = Signal.cellOk<Focus>('searchbox');

export const searchboxFocused =
  focus.map(focus => focus === 'searchbox', true)

export const notesFocused =
  focus.map(focus => focus === 'notes', true)

export const editorFocused =
  focus.map(focus => focus === 'editor', true)

export const titlebarFocused =
  focus.map(focus => focus === 'editor', true)
