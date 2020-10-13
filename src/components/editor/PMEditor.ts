import * as Slate from 'slate'
import * as PMAST from '../../PMAST';

export type PMEditor = Slate.Editor & {
  toggleMark(mark: PMAST.mark): void;
  setType(type: PMAST.type): void;
}

const toggleMark = (editor: Slate.Editor, mark: PMAST.mark) => {
  if (editor.selection) {
    if (Slate.Range.isExpanded(editor.selection)) {
      const marked = [...Slate.Editor.nodes(
        editor,
        { match: Slate.Text.isText }
      )].every(([node, _path]) => mark in node);
      if (marked) {
        Slate.Transforms.unsetNodes(
          editor,
          mark,
          { match: Slate.Text.isText, split: true },
        );
      } else {
        Slate.Transforms.setNodes(
          editor,
          { [mark]: true },
          { match: Slate.Text.isText, split: true },
        )
      }

    } else {
      // TODO(jaked)
      // Editor.marks computes marks from the nearest text
      // is editor.marks already kept in sync with that?
      const marks = Slate.Editor.marks(editor) || {};
      if (mark in marks) {
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

const setType = (editor: Slate.Editor, type: PMAST.type) => {
  Slate.Transforms.unwrapNodes(editor, {
    match: node => node.type === 'ol' || node.type === 'ul',
    split: true,
  });
  if (type === 'ol' || type === 'ul') {
    Slate.Transforms.wrapNodes(editor, { type, children: [] });
    Slate.Transforms.setNodes(editor, { type: 'li' });
  } else {
    Slate.Transforms.setNodes(editor, { type });
  }
}

export const withPMEditor = (editor: Slate.Editor) => {
  editor.toggleMark = (mark: PMAST.mark) => {
    toggleMark(editor, mark);
  }
  editor.setType = (type: PMAST.type) => {
    setType(editor, type);
  }
  return editor as PMEditor;
}
