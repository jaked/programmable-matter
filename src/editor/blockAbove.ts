import { Editor, Location, NodeEntry } from 'slate';
import * as PMAST from '../model/PMAST';

export const blockAbove = (
  editor: Editor,
  opts: { at?: Location } = {}
) => {
  const blockEntry = Editor.above(editor, {
    at: opts.at,
    match: node => Editor.isBlock(editor, node)
  });
  if (blockEntry) {
    return blockEntry as NodeEntry<PMAST.Block>
  }
}
