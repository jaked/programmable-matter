import * as Immer from 'immer';
import { Editor, Element, Node, Path, Point, Range, Transforms } from 'slate';
import * as PMAST from '../pmast';
import { bug } from '../util/bug';

function hasPrevious(path: Path) {
  return path[path.length - 1] > 0;
}

export const normalizeNode = (editor: Editor) => {
  const { normalizeNode } = editor;
  return ([node, path]: [Node, Path]) => {
    // TODO(jaked)
    // this avoids crashing the editor but loses the cursor position
    if (Editor.isEditor(node) && node.children.length === 0) {
      editor.children = PMAST.empty;
      return;
    }

    // remove empty inlines
    if ((PMAST.isLink(node) || PMAST.isInlineLiveCode(node)) && Editor.isEmpty(editor, node)) {
      return Transforms.removeNodes(editor, { at: path });
    }

    if ((PMAST.isList(node) || PMAST.isBlockquote(node)) &&
        (node.children.length === 0 ||
        // Editor.normalize inserts empty text nodes into empty elements :/
        (node.children.length === 1 && PMAST.isText(node.children[0]) && node.children[0].text === ''))) {
      return Transforms.removeNodes(editor, { at: path });
    }

    // merge adjacent lists / block quotes
    if ((PMAST.isList(node) || PMAST.isBlockquote(node)) && hasPrevious(path)) {
      const prevPath = Path.previous(path);
      const prevNode = Node.get(editor, prevPath);
      if (PMAST.isElement(prevNode) && prevNode.type === node.type) {
        return Transforms.mergeNodes(editor, { at: path });
      }
    }

    // work around an apparent Slate bug:
    // Transforms.mergeNodes moves a node's children into the previous node
    // but the children are not marked dirty so are not normalized
    // if their normalization depends on siblings (as here)
    // then the tree is left in an unnormalized state
    if (Element.isElement(node)) {
      for (const [child, childPath] of Node.children(editor, path)) {
        if ((PMAST.isList(child) || PMAST.isBlockquote(child)) && hasPrevious(childPath)) {
          const prevPath = Path.previous(childPath);
          const prevNode = Node.get(editor, prevPath);
          if (PMAST.isElement(prevNode) && prevNode.type === child.type) {
            return Transforms.mergeNodes(editor, { at: childPath });
          }
        }
      }
    }

    // Transforms.moveNodes can leave empty nodes
    // default normalizeNode inserts a { text: "" }
    if ((PMAST.isList(node) || PMAST.isListItem(node)) && node.children.length === 0) {
      return Transforms.removeNodes(editor, { at: path });
    }

    // ensure that list items begin with a p
    // by finding the next p and moving it up
    if (PMAST.isListItem(node) && !PMAST.isParagraph(node.children[0])) {
      if (hasPrevious(path)) {
        return Transforms.mergeNodes(editor, { at: path });
      } else {
        // TODO(jaked) check that the p is in an li and not a blockquote etc.
        const [p] = Editor.nodes(editor, { at: path, match: node => PMAST.isParagraph(node) });
        if (p) {
          const [pNode, pPath] = p;
          Transforms.moveNodes(editor, { at: pPath, to: path.concat(0) });
          return;
        } else {
          return Transforms.insertNodes(
            editor,
            { type: 'p', children: [] },
            { at: path.concat(0) }
          );
        }
      }
    }

    normalizeNode([node, path]);
  }
}
