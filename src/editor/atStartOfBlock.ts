import { Editor, Point, Range } from 'slate';

export const atStartOfBlock = (editor: Editor) => {
  const above = Editor.above(editor);
  if (!editor.selection || Range.isExpanded(editor.selection) || !above)
    return false;
  const [, path] = above;
  const start = Editor.start(editor, path);
  if (Point.equals(editor.selection.anchor, start))
    return true;
  return false;
}
