import { Editor, Range, Transforms } from 'slate';

import { bug } from '../util/bug';

import { inListItem } from './inListItem';
import { blockAbove } from './blockAbove';

export const indent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;

    if (Range.isExpanded(editor.selection)) {

    } else {
      const inListItemResult = inListItem(editor);
      if (inListItemResult) {
        const { itemNode, listNode } = inListItemResult;
        const [_, path] = blockAbove(editor) ?? bug(`expected block`);

        Transforms.wrapNodes(
          editor,
          { type: itemNode.type, children: [] },
          { at: path }
        );
        Transforms.wrapNodes(
          editor,
          { type: listNode.type, children: [] },
          { at: path }
        );
      }
    }
  });
}
