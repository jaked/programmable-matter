import { Editor, Range, Transforms } from 'slate';
import { inListItem } from './inListItem';

export const indent = (editor: Editor) => {
  if (!editor.selection) return;

  if (Range.isExpanded(editor.selection)) {

  } else {
    const inListItemResult = inListItem(editor);
    if (inListItemResult) {
      const { itemNode, itemPath, listNode, listPath } = inListItemResult;
      if (itemPath[itemPath.length - 1] > 0) {
        Transforms.wrapNodes(
          editor,
          { type: listNode.type, children: [] },
          { at: itemPath }
        );
        Transforms.wrapNodes(
          editor,
          { type: itemNode.type, children: [] },
          { at: itemPath }
        );
        Transforms.mergeNodes(editor, { at: itemPath });
      }
    }
  }
}
