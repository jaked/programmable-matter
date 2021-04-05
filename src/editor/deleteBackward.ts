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
        if (inListItem(editor)) {
          if (!blockIsEmpty(editor)) {
            return dedent(editor);
          } else {
            // TODO(jaked)
            // for some reason I don't understand
            // the stock deleteBackward deletes the whole list item
            // so we special case it
            const [_, path] = blockAbove(editor) ?? bug(`expected blockEntry`);
            return Slate.Transforms.delete(editor, { at: path });
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
