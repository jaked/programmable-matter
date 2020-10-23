import { Editor, Node, Path, Text, Transforms } from 'slate';
import * as PMAST from '../PMAST';

export const normalizeNode = (editor: Editor) => {
  const { normalizeNode } = editor;
  return ([node, path]: [Node, Path]) => {
    if (!Text.isText(node)) {
      let prevType: PMAST.type | undefined = undefined;
      for (const [child, childPath] of Node.children(editor, path)) {
        if (child.type === prevType && (prevType === 'ol' || prevType === 'ul')) {
          Transforms.mergeNodes(editor, {
            at: childPath,
          });
          return;
        }
        prevType = child.type as PMAST.type;
      }
    }
    normalizeNode([node, path]);
  }
}
