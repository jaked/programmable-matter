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
      if (PMAST.isHeader(node) && cursorAtBlockEnd(editor)) {
        // TODO(jaked) should we apply marks here?
        Transforms.insertNodes(editor, { type: 'p', children: [ { text: '' } ]})
        return;
      }
      if (node.type === 'code') {
        softBreak(editor);
        return;
      }
    }

    if (inListItem(editor)) {
      if (blockIsEmpty(editor)) {
        dedent(editor);
      } else {
        // TODO(jaked)
        // do we ever get `insertBreak` with selection unset or not collapsed?
        const { selection } = editor;
        if (selection) {
          // we wrap / lift the first node after breaking
          // to avoid messing up a trailing nested list
          const ref = Editor.pointRef(editor, selection.anchor, { affinity: 'backward' });
          // <li><p>...<ref/>...</p>...</li>
          insertBreak();
          // <li><p>...<ref/></p><p>...</p>...</li>
          const block = blockAbove(editor, { at: ref.current! });
          if (block) {
            const [, path] = block;
            Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path });
            // <li><li><p>...<ref/></p></li><p>...</p>...</li>
            Transforms.liftNodes(editor, { at: path });
            // <li><p>...<ref/></p></li><li><p>...</p>...</li>
          }
        }
      }
      return;
    }

    insertBreak();
  }
}
