import { Editor } from 'slate';

export const blockIsEmpty = (editor: Editor) => {
  const above = Editor.above(editor);
  if (above) {
    const [node, path] = above;
    if (node.children.length === 1 && node.children[0].text === '')
      return true;
  }
  return false;
}
