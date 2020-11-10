import { Editor, Point, Range } from 'slate';

import { blockAbove } from './blockAbove';

export const atStartOfBlock = (editor: Editor) => {
  const blockEntry = blockAbove(editor);
  if (!editor.selection || Range.isExpanded(editor.selection) || !blockEntry)
    return false;
  const [, path] = blockEntry;
  const start = Editor.start(editor, path);
  if (Point.equals(editor.selection.anchor, start))
    return true;
  return false;
}
