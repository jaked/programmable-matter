import { Editor, Point, Range } from 'slate';

import { blockAbove } from './blockAbove';

export const cursorAtBlockEnd = (editor: Editor) => {
  const selection = editor.selection;
  if (selection && Range.isCollapsed(selection)) {
    const blockEntry = blockAbove(editor);
    if (blockEntry) {
      const [node, path] = blockEntry;
      const end = Editor.end(editor, path);
      return Point.equals(selection.anchor, end);
    }
  }
  return false;
}
