import { Editor, NodeEntry } from 'slate';
import * as PMAST from '../PMAST';

export const blockAbove = (editor: Editor) => {
  const blockEntry = Editor.above(editor, {
    match: node => Editor.isBlock(editor, node)
  });
  if (blockEntry) {
    return blockEntry as NodeEntry<PMAST.Block>
  }
}
