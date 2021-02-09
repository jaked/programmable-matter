import * as Immer from 'immer';
import { Editor, Node, Path, Point, Range, Text, Transforms } from 'slate';
import * as PMAST from '../model/PMAST';
import { bug } from '../util/bug';

export const normalizeNode = (editor: Editor) => {
  const { normalizeNode } = editor;
  return ([node, path]: [Node, Path]) => {
    if ((PMAST.isLink(node) || PMAST.isInlineCode(node)) && Editor.isEmpty(editor, node)) {
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
        if (child.type === prevType && (PMAST.isList(child) || PMAST.isBlockquote(child))) {
          return Transforms.mergeNodes(editor, {
            at: childPath,
          });
        }
        if (PMAST.isListItem(child)) {
          if (child.children.length === 0 || !PMAST.isParagraph(child.children[0])) {
            if (prevType === undefined) {
              return Transforms.insertNodes(
                editor,
                { type: 'p', children: [] },
                { at: childPath.concat(0) }
              );
            } else {
              return Transforms.mergeNodes(editor, {
                at: childPath,
              });
            }
          }
        }
        prevType = child.type as PMAST.type;
      }
    }
    normalizeNode([node, path]);
  }
}
