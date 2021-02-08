import { Editor, Path, Transforms } from 'slate';

import { blockAbove } from './blockAbove';
import { inBlockquote } from './inBlockquote';
import { inListItem } from './inListItem';

export const exitBreak = (editor: Editor) => {
  const blockquoteEntry = inBlockquote(editor);
  if (blockquoteEntry) {
    const [blockquote, path] = blockquoteEntry;
    const at = Path.next(path);
    Transforms.insertNodes(
      editor,
      { type: 'p', children: [] },
      { at }
    );
    Transforms.select(editor, at);
    return;
  }

  const inListItemResult = inListItem(editor);
  if (inListItemResult) {
    const at = Path.next(inListItemResult.listPath);
    Transforms.insertNodes(
      editor,
      { type: 'p', children: [] },
      { at }
    );
    Transforms.select(editor, at);
    return;
  }

  const blockEntry = blockAbove(editor);
  if (blockEntry) {
    const [block, path] = blockEntry;
    if (block.type === 'code') {
      const at = Path.next(path);
      Transforms.insertNodes(
        editor,
        { type: 'p', children: [] },
        { at }
      );
      Transforms.select(editor, at);
      return;
    }
  }
  editor.insertBreak();
}
