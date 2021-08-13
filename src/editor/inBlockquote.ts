import { Editor, Path } from 'slate';
import * as PMAST from '../pmast';
import { blockAbove } from './blockAbove';

export const inBlockquote = (editor: Editor, options: { at?: Path } = {}): undefined | [PMAST.Blockquote, Path] => {
  const at =
    options.at ?
      Editor.node(editor, options.at) :
      blockAbove(editor);
  if (at) {
    const [_, path] = at;
    const parent = Editor.parent(editor, path);
    if (parent) {
      const [node, path] = parent;
      if (PMAST.isBlockquote(node)) {
        return [node, path];
      }
    }
  }
}
