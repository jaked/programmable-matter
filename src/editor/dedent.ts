import { Editor, Range, Transforms } from 'slate';

import { bug } from '../util/bug';

import { blockAbove } from './blockAbove';
import { inListItem } from './inListItem';

export const dedent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;

    if (Range.isExpanded(editor.selection)) {

    } else {
      if (inListItem(editor)) {
        const [_, path] = blockAbove(editor) ?? bug(`expected block`);
        const pathRef = Editor.pathRef(editor, path);
        Transforms.liftNodes(editor, { at: pathRef.current! }); // ul > li > p -> ul > p
        Transforms.liftNodes(editor, { at: pathRef.current! }); // ul > p -> p
        if (inListItem(editor, { at: pathRef.current! })) {
          Transforms.liftNodes(editor, { at: pathRef.current! }); // ul > li > p -> ul > p
          Transforms.wrapNodes(
            editor,
            { type: 'li', children: [] },
            { at: pathRef.current! }
          ); // ul > li > p (a fresh li with nothing else in it)
        }
        pathRef.unref();
      } else {
        Transforms.setNodes(editor, { type: 'p' });
      }
    }
  });
}
