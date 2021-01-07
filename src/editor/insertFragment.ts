import { Editor, Element, Node, Text, Transforms } from 'slate';

import { bug } from '../util/bug';
import * as PMAST from '../PMAST';

import { blockAbove } from './blockAbove';
import { inListItem } from './inListItem';

export const insertFragment = (editor: Editor) => {
  const { insertFragment } = editor;
  return (fragment: Node[]) => {
    // console.log(`insertFragment(${JSON.stringify(fragment)})`);

    // TODO(jaked) delete selection if expanded

    // TODO(jaked) should work with PMAST.Nodes here

    // the pasted fragment includes the element tree up to the root
    let lowest: Node = { children: fragment };
    while (Element.isElement(lowest) && lowest.children.length === 1)
      lowest = lowest.children[0];

    // TODO(jaked) strip marks when pasting into code
    if (Text.isText(lowest)) {
      return Transforms.insertNodes(editor, lowest);
    } else if (lowest.type === 'p') {
      return Transforms.insertNodes(editor, lowest.children);
    }

    const inListItemResult = inListItem(editor);
    if (inListItemResult) {
      bug(`unimplemented`);
    } else {
      const [aboveNode, abovePath] = blockAbove(editor) ?? bug('expected block above');
      if (aboveNode.type === 'p') {
        Transforms.insertNodes(editor, lowest.children);
      } else {
        bug(`unimplemented`);
      }
    }
  }
}
