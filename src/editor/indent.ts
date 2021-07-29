import { Editor, Range, Transforms } from 'slate';

import { bug } from '../util/bug';
import * as PMAST from '../model/PMAST';

import { inListItem } from './inListItem';

export const indent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;
    const at = Editor.unhangRange(editor, editor.selection);

    const items = [...Editor.nodes(editor, { at, match: PMAST.isListItem })];
    for (const [_, itemPath] of items) {
      const blockPath = itemPath.concat(0);
      const inListItemResult = inListItem(editor, { at: blockPath });
      if (!inListItemResult) bug(`expected inListItem`);
      const { itemNode, listNode } = inListItemResult;
      Transforms.wrapNodes(
        editor,
        { ...itemNode, children: [] },
        { at: blockPath }
      );
      Transforms.wrapNodes(
        editor,
        { ...listNode, children: [] },
        { at: blockPath }
      );
    }
  });
}
