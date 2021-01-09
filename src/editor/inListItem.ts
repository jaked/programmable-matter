import { Editor, Element, Path } from 'slate';
import { blockAbove } from './blockAbove';

export const inListItem = (editor: Editor, options: { at?: Path } = {}): undefined | {
  itemNode: Element,
  itemPath: Path,
  listNode: Element,
  listPath: Path,
} => {
  const at =
    options.at ?
      Editor.node(editor, options.at) :
      blockAbove(editor);
  if (at) {
    const [node, path] = at;
    const item = Editor.parent(editor, path);
    if (item) {
      const [itemNode, itemPath] = item
      if (itemNode.type === 'li') {
        const list = Editor.parent(editor, itemPath);
        const [listNode, listPath] = list;
        return { itemNode, itemPath, listNode, listPath };
      }
    }
  }
}
