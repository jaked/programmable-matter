import { Editor, Range, Text, Transforms } from 'slate';
import * as PMAST from '../pmast';

export const toggleMark = (editor: Editor, mark: PMAST.mark) => {
  if (!editor.selection) return;

  if (Range.isExpanded(editor.selection)) {
    const marked = [...Editor.nodes(
      editor,
      { match: Text.isText }
    )].every(([node, _path]) => mark in node);
    if (marked) {
      Transforms.unsetNodes(
        editor,
        mark,
        { match: Text.isText, split: true },
      );
    } else {
      Transforms.setNodes(
        editor,
        { [mark]: true },
        { match: Text.isText, split: true },
      )
    }

  } else {
    // TODO(jaked)
    // Editor.marks computes marks from the nearest text
    // is editor.marks already kept in sync with that?
    const marks = Editor.marks(editor) || {};
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
