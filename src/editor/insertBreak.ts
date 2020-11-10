import { Editor, Transforms } from 'slate';

import * as PMAST from '../PMAST';
import { blockAbove } from './blockAbove';
import { blockIsEmpty } from './blockIsEmpty';
import { cursorAtBlockEnd } from './cursorAtBlockEnd';
import { dedent } from './dedent';
import { inListItem } from './inListItem';
import { softBreak } from './softBreak';

export const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;
  return () => {
    const blockEntry = blockAbove(editor);
    if (blockEntry) {
      const [node] = blockEntry;
      if (cursorAtBlockEnd(editor)) {
        if (PMAST.isHeader(node)) {
          // TODO(jaked) should we apply marks here?
          Transforms.insertNodes(editor, { type: 'p', children: [ { text: '' } ]})
          return;
        }
        if (node.type === 'code') {
          softBreak(editor);
          return;
        }
      }
    }

    if (inListItem(editor)) {
      if (blockIsEmpty(editor)) {
        dedent(editor);
      } else {
        insertBreak();
        const block = blockAbove(editor);
        if (block) {
          const [, path] = block;
          Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path });
          Transforms.liftNodes(editor, { at: path });
        }
      }
      return;
    }

    insertBreak();
  }
}
