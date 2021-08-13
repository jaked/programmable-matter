import * as Slate from 'slate';
import * as PMAST from '../pmast';

export const blockAbove = (
  editor: Slate.Editor,
  opts: { at?: Slate.Location } = {}
) => {
  const blockEntry = Slate.Editor.above(editor, {
    at: opts.at,
    match: node => Slate.Editor.isBlock(editor, node)
  });
  if (blockEntry) {
    return blockEntry as Slate.NodeEntry<PMAST.Block>
  }
}
