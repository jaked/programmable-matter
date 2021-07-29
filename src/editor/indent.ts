import { Editor, Node, Transforms } from 'slate';

// avoid https://github.com/aelbore/esbuild-jest/issues/21
import { isLeafBlock as isLeafBlockFn } from './isLeafBlock';

import { inListItem } from './inListItem';

export const indent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;
    const at = Editor.unhangRange(editor, editor.selection);
    const match = (node: Node) => isLeafBlockFn(editor, node);
    const blocks = [...Editor.nodes(editor, { at, match })];

    for (const [_, blockPath] of blocks) {
      const inListItemResult = inListItem(editor, { at: blockPath });
      if (inListItemResult) {
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
    }
  });
}
