import { Editor, Element, Path } from 'slate';
import { bug } from '../util/bug';
import { blockAbove } from './blockAbove';
import * as PMAST from '../pmast';

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
      if (PMAST.isListItem(itemNode)) {
        const list = Editor.parent(editor, itemPath);
        const [listNode, listPath] = list;
        if (!PMAST.isList(listNode)) bug(`expected List`)
        return { itemNode, itemPath, listNode, listPath };
      }
    }
  }
}
