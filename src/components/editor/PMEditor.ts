import * as Slate from 'slate'

export type PMEditor = Slate.Editor & {
  toggleBold: () => void
}

const toggleMark = (editor: Slate.Editor, mark: 'bold') => {
  if (editor.selection) {
    if (Slate.Range.isExpanded(editor.selection)) {

    } else {
      // TODO(jaked)
      // Editor.marks computes marks from the nearest text
      // is editor.marks already kept in sync with that?
      const marks = Slate.Editor.marks(editor) || {};
      if (mark in marks && marks[mark]) {
        const newMarks = { ...marks };
        delete newMarks[mark];
        editor.marks = newMarks;
      } else {
        const newMarks = { ...marks, [mark]: true }
        editor.marks = newMarks
      }
      editor.onChange();
    }
  }
}

export const withPMEditor = (editor: Slate.Editor) => {
  editor.toggleBold = () => {
    toggleMark(editor, 'bold');
  }
  return editor as PMEditor;
}
