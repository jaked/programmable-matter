import { Editor, Element, Transforms } from 'slate';
import * as PMAST from '../pmast';

import { inListItem } from './inListItem';

export const setType = (editor: Editor, elemOrType: Element | PMAST.type) => {
  const type = Element.isElement(elemOrType) ? elemOrType.type : elemOrType;
  const elem: Element =
    Element.isElement(elemOrType) ?
      elemOrType :
      { type: elemOrType, children: [] } as Element; // TODO(jaked) why?

  const inListItemResult = inListItem(editor);
  if (inListItemResult) {
    const { itemPath, listNode, listPath } = inListItemResult;
    if (type === 'ul' || type === 'ol') {
      if (listNode.type !== type) {
        Transforms.wrapNodes(
          editor,
          elem,
          { at: itemPath }
        );
        Transforms.liftNodes(editor, { at: itemPath });
      }
    } else {
      if (!inListItem(editor, { at: listPath })) {
        Transforms.unwrapNodes(editor, { at: itemPath });
        Transforms.liftNodes(editor, { at: itemPath });
        Transforms.setNodes(editor, elem);
      }
    }
  } else {
    if (type === 'ol' || type === 'ul') {
      Transforms.setNodes(editor, { type: 'p' });
      Transforms.wrapNodes(editor, elem);
      // TODO(jaked) wrap individual paragraphs
      Transforms.wrapNodes(editor, { type: 'li', children: [] });
    } else if (type === 'blockquote') {
      Transforms.wrapNodes(editor, elem);
    } else {
      Transforms.setNodes(editor, elem);
    }
  }
}
