import { Editor, Path, Range, Transforms } from 'slate';
import { inListItem } from './inListItem';

export const dedent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;

    if (Range.isExpanded(editor.selection)) {

    } else {
      const inListItemResult = inListItem(editor);
      if (inListItemResult) {
        const { itemNode, itemPath, listNode, listPath } = inListItemResult;
        const itemPos = itemPath[itemPath.length - 1];

        // if there are items in the list below the one we're dedenting...
        if (itemPos < listNode.children.length - 1) {
          // split them into a new list...
          const nextRef = Editor.pathRef(editor, Path.next(itemPath));
          Transforms.splitNodes(editor, { at: nextRef.current! });
          // move the new list under the item we're dedenting
          const newListPath = Path.parent(nextRef.current!);
          // TODO(jaked) what if itemNode contains a list of a different type?
          const nestedListPath = itemPath.concat(itemNode.children.length);
          Transforms.moveNodes(editor, { at: newListPath, to: nestedListPath });
          nextRef.unref();
        }

        const itemRef = Editor.pathRef(editor, itemPath);
        // ul > li > p --> li > p
        Transforms.liftNodes(editor, { at: itemRef.current! });
        if (inListItem(editor, { at: listPath })) {
          // ul > li > li > p --> ul > li > p
          Transforms.liftNodes(editor, { at: itemRef.current! });
        } else {
          // li > p --> p
          Transforms.unwrapNodes(editor, { at: itemRef.current! });
        }
        itemRef.unref();
      } else {
        Transforms.setNodes(editor, { type: 'p' });
      }
    }
  });
}
