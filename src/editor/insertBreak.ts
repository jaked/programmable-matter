import { Editor, Transforms } from 'slate';

import { blockIsEmpty } from './blockIsEmpty';
import { dedent } from './dedent';
import { inListItem } from './inListItem';

export const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;
  return () => {
    if (inListItem(editor)) {
      if (blockIsEmpty(editor)) {
        dedent(editor);
      } else {
        insertBreak();
        const above = Editor.above(editor);
        if (above) {
          const [, path] = above;
          Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path });
          Transforms.liftNodes(editor, { at: path });
        }
      }
      return;
    }

    insertBreak();
  }
}
