import { Editor, Range, Transforms } from 'slate';
import { inListItem } from './inListItem';

export const dedent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;

    if (Range.isExpanded(editor.selection)) {

    } else {
      const inListItemResult = inListItem(editor);
      if (inListItemResult) {
        const { itemPath, listPath } = inListItemResult;
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
