import { Editor, Transforms } from 'slate';

import { blockAbove } from './blockAbove';

export const exitBreak = (editor: Editor) => {
  const blockEntry = blockAbove(editor);
  if (blockEntry) {
    const [block, path] = blockEntry;
    if (block.type === 'code') {
      const at = Editor.end(editor, path);
      Transforms.select(editor, at);
      Transforms.insertNodes(
        editor,
        { type: 'p', children: [ { text: ''} ] }
      );
      return;
    }
  }
  editor.insertBreak();
}
