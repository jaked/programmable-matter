import { Editor, Element, Node, Range, Text, Transforms } from 'slate';

import { bug } from '../util/bug';

import { blockAbove } from './blockAbove';
import { inListItem } from './inListItem';

function insertNodes(editor: Editor, nodes: Node[] | Node) {
  const { selection } = editor;
  if (!selection) return;

  // Transforms.insertNodes leaves the cursor after the first inserted node
  const endRef = Editor.pointRef(editor, Range.end(selection));
  Transforms.insertNodes(editor, nodes);
  Transforms.select(editor, endRef.current!);
}

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
      return insertNodes(editor, lowest);
    } else if (lowest.type === 'p') {
      return insertNodes(editor, lowest.children);
    }

    const inListItemResult = inListItem(editor);
    if (inListItemResult) {
      bug(`unimplemented`);
    } else {
      const [aboveNode, abovePath] = blockAbove(editor) ?? bug('expected block above');
      if (aboveNode.type === 'p') {
        insertNodes(editor, lowest.children);
      } else {
        bug(`unimplemented`);
      }
    }
  }
}
