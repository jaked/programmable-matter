import { Editor, Element, Path } from 'slate';
import { Blockquote } from '../model/PMAST';
import { blockAbove } from './blockAbove';

export const inBlockquote = (editor: Editor, options: { at?: Path } = {}): undefined | [Blockquote, Path] => {
  const at =
    options.at ?
      Editor.node(editor, options.at) :
      blockAbove(editor);
  if (at) {
    const [node, path] = at;
    const parent = Editor.parent(editor, path);
    if (parent) {
      const [node, path] = parent;
      if (node.type === 'blockquote') {
        return [node as Blockquote, path];
      }
    }
  }
}
