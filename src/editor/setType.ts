import { Editor, Transforms } from 'slate';
import * as PMAST from '../PMAST';

import { inListItem } from './inListItem';

export const setType = (editor: Editor, type: PMAST.type) => {
  const inListItemResult = inListItem(editor);
  if (inListItemResult) {
    const { itemPath, listNode, listPath } = inListItemResult;
    if (type === 'ul' || type === 'ol') {
      if (listNode.type !== type) {
        Transforms.wrapNodes(
          editor,
          { type, children: [] },
          { at: itemPath }
        );
        Transforms.liftNodes(editor, { at: itemPath });
      }
    } else {
      if (!inListItem(editor, { at: listPath })) {
        Transforms.unwrapNodes(editor, { at: itemPath });
        Transforms.liftNodes(editor, { at: itemPath });
        Transforms.setNodes(editor, { type });
      }
    }
  } else {
    if (type === 'ol' || type === 'ul') {
      Transforms.setNodes(editor, { type: 'p' });
      Transforms.wrapNodes(editor, { type, children: [] });
      // TODO(jaked) wrap individual paragraphs
      Transforms.wrapNodes(editor, { type: 'li', children: [] });
    } else if (type === 'blockquote') {
      Transforms.wrapNodes(editor, { type: 'blockquote', children: [] });
    } else {
      Transforms.setNodes(editor, { type });
    }
  }
}
