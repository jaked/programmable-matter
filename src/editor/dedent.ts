import { Editor, Node, Transforms } from 'slate';

// avoid https://github.com/aelbore/esbuild-jest/issues/21
import { isLeafBlock as isLeafBlockFn } from './isLeafBlock';

import { inBlockquote } from './inBlockquote';
import { inListItem } from './inListItem';

export const dedent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;
    const at = Editor.unhangRange(editor, editor.selection);
    const match = (node: Node) => isLeafBlockFn(editor, node);
    const blocks = [...Editor.nodes(editor, { at, match })];
    const pathRefs = Array.from(blocks, ([, p]) => Editor.pathRef(editor, p))

    for (const pathRef of pathRefs) {
      if (inListItem(editor, { at: pathRef.current! })) {
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

      } else if (inBlockquote(editor, { at: pathRef.current! })) {
        return Transforms.liftNodes(editor, { at: pathRef.current! });

      } else {
        Transforms.setNodes(editor, { type: 'p' }, { at: pathRef.current! });
      }

      pathRef.unref();
    }
  });
}
