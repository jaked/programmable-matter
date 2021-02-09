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
    Transforms.insertNodes(
      editor,
      { type: 'p', children: [{text:''}] },
      { match: node => node === block },
    );
    return;
  }

  editor.insertBreak();
}
