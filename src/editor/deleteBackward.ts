import { Editor } from 'slate';

import { atStartOfBlock } from './atStartOfBlock';
import { blockAbove } from './blockAbove';
import { blockIsEmpty } from './blockIsEmpty';
import { dedent } from './dedent';
import { inListItem } from './inListItem'

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;
  return (unit: 'character' | 'word' | 'line' | 'block') => {
    if (!blockIsEmpty(editor) && atStartOfBlock(editor)) {
      const blockEntry = blockAbove(editor);
      if (blockEntry) {
        const [block] = blockEntry;
        if (block.type !== 'p' || inListItem(editor)) {
          dedent(editor);
          return;
        }
      }
    }

    deleteBackward(unit);
  }
}
