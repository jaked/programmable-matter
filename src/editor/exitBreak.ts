import { Editor, Path, Transforms } from 'slate';
import * as PMAST from '../model/PMAST';

export const exitBreak = (editor: Editor) => {
  const exitableBlock = Editor.above(editor, {
    match: node => {
      const pmNode = node as PMAST.Node;
      return PMAST.isCode(pmNode) || PMAST.isBlockquote(pmNode) || PMAST.isList(pmNode);
    }
  });

  if (exitableBlock) {
    const [block, path] = exitableBlock;
    const at = Path.next(path);
    Editor.withoutNormalizing(editor, () => { // otherwise list is unsplit after split
      Transforms.splitNodes(
        editor,
        { match: node => node === block },
      );
      Transforms.insertNodes(
        editor,
        { type: 'p', children: [] },
        { at }
      );
    });
    Transforms.select(editor, at);
    return;
  }

  editor.insertBreak();
}
