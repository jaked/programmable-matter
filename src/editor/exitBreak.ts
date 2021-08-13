import { Editor, Transforms } from 'slate';
import * as PMAST from '../pmast';

export const exitBreak = (editor: Editor) => {
  const exitableBlock = Editor.above(editor, {
    match: node => {
      return PMAST.isCode(node) || PMAST.isLiveCode(node) || PMAST.isBlockquote(node) || PMAST.isList(node);
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
