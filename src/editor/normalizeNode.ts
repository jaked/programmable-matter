import * as Immer from 'immer';
import { Editor, Node, Path, Point, Range, Text, Transforms } from 'slate';
import * as PMAST from '../model/PMAST';
import { bug } from '../util/bug';

export const normalizeNode = (editor: Editor) => {
  const { normalizeNode } = editor;
  return ([node, path]: [Node, Path]) => {
    const pmNode = node as PMAST.Node;
    if ((PMAST.isLink(pmNode) || PMAST.isInlineCode(pmNode)) && Editor.isEmpty(editor, pmNode)) {
      if (editor.selection) {
        // if a selection endpoint is in the link,
        // unwrapping the link and normalizing can move the endpoint to the previous node
        // to avoid this move the endpoint after the link
        // TODO(jaked) better way to do this?
        const inPoint = { path: path.concat(0), offset: 0 };
        const afterPoint = Editor.after(editor, inPoint) ?? bug('expected after');
        // TODO(jaked) should maybe use Transforms.select here
        editor.selection = Immer.produce(editor.selection, selection => {
          for (const [point, endpoint] of Range.points(selection)) {
            if (Point.equals(point, inPoint))
              selection[endpoint] = afterPoint;
          }
        });
      }
      Transforms.unwrapNodes(editor, { at: path });
      return;
    }

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
