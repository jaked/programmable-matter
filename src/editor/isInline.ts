import { Editor, Element } from 'slate';

import * as PMAST from '../model/PMAST';

export const isInline = (editor: Editor) => {
  const { isInline } = editor;
  return (element: Element) => {
    if (PMAST.isLink(element) || PMAST.isInlineLiveCode(element))
      return true;

    else
      return isInline(element);
  }
}
