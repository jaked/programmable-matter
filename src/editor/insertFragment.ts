import { Editor, Element, Node, Range, Text, Transforms } from 'slate';

import { bug } from '../util/bug';

import { blockAbove } from './blockAbove';
import { inListItem } from './inListItem';

function insertNodes(
  editor: Editor,
  nodes: Node[] | Node,
  options: {
    match?: (node: Node) => boolean
  } = {}
) {
  const { selection } = editor;
  if (!selection) return;

  // Transforms.insertNodes doesn't always leave the cursor after the inserted nodes
  const after = Editor.after(editor, Range.end(selection));
  if (after) {
    const afterRef = Editor.pointRef(editor, after);
    Transforms.insertNodes(editor, nodes, options);
    const before = Editor.before(editor, afterRef.unref()!) ?? bug(`expected before`);
    Transforms.select(editor, before);
  } else {
    Transforms.insertNodes(editor, nodes, options);
    Transforms.select(editor, Editor.end(editor, []));
  }
}

export const insertFragment = (editor: Editor) => {
  const { insertFragment } = editor;
  return (fragment: Node[]) => {
    // console.log(`insertFragment(${JSON.stringify(fragment, undefined, 2)})`);

    // TODO(jaked) delete selection if expanded

    // TODO(jaked) should work with PMAST.Nodes here

    // the pasted fragment includes the element tree up to the root
    // drill down to the part we actually want to paste
    let lowest: Node = { type: 'fragment', children: fragment };
    while (true) {
      if (Text.isText(lowest)) break;
      if (Editor.isInline(editor, lowest)) break;
      // type predicate on Editor.isInline types `lowest` as `never` here
      lowest = lowest as Element;
      if (lowest.children.length > 1) break;
      lowest = lowest.children[0];
    }

    // TODO(jaked) strip marks when pasting into code
    if (Text.isText(lowest))
      return insertNodes(editor, lowest);
    if (Editor.isInline(editor, lowest))
      return insertNodes(editor, lowest);
    // type predicate on Editor.isInline types `lowest` as `never` here
    lowest = lowest as Element;
    if (lowest.type === 'p')
      return insertNodes(editor, lowest.children);

    if (lowest.type === 'fragment') {
      return insertNodes(editor, lowest.children);
    }

    if (lowest.type === 'ul') {
      const inListItemResult = inListItem(editor);
      if (inListItemResult) {
        insertNodes(
          editor,
          lowest.children,
          { match: node => node === inListItemResult.itemNode }
        );
        return;
      } else {
        const [aboveNode, abovePath] = blockAbove(editor) ?? bug('expected block above');
        if (aboveNode.type === 'p') {
          return insertNodes(editor, lowest);
        }
      }
    }

    bug(`unimplemented ${lowest.type}`);
  }
}
