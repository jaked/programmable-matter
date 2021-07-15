import { Editor, Text } from 'slate';

export const blockIsEmpty = (editor: Editor) => {
  const above = Editor.above(editor);
  if (above) {
    const [node, path] = above;
    if (node.children.length === 1 &&
        Text.isText(node.children[0]) &&
        node.children[0].text === '')
      return true;
  }
  return false;
}
