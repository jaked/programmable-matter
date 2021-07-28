import * as Slate from 'slate';

import { bug } from '../util/bug';

import { atStartOfBlock } from './atStartOfBlock';
import { blockAbove } from './blockAbove';
import { blockIsEmpty } from './blockIsEmpty';
import { dedent } from './dedent';
import { inBlockquote } from './inBlockquote'
import { inListItem } from './inListItem'

export const deleteBackward = (editor: Slate.Editor) => {
  const { deleteBackward } = editor;
  return (unit: 'character' | 'word' | 'line' | 'block') => {
    Slate.Editor.withoutNormalizing(editor, () => {
      if (atStartOfBlock(editor)) {
        const inListItemResult = inListItem(editor);
        if (inListItemResult &&
            !Slate.Path.hasPrevious(inListItemResult.itemPath) &&
            inListItemResult.itemNode.children.length === 1) {
          if (blockIsEmpty(editor)) {
            return Slate.Transforms.removeNodes(editor, { at: inListItemResult.itemPath });
          } else {
            return dedent(editor);
          }
        }

        if (inBlockquote(editor)) {
          return dedent(editor);
        }

        if (!blockIsEmpty(editor)) {
          const [block, _] = blockAbove(editor) ?? bug(`expected block`);
          if (block.type !== 'p') {
            return dedent(editor);
          }
        }
      }

      deleteBackward(unit);
    });
  }
}
