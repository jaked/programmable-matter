import { Editor, Element } from 'slate';

export const isInline = (editor: Editor) => {
  const { isInline } = editor;
  return (element: Element) => {
    switch (element.type) {
      case 'a':
      case 'inlineCode':
        return true;

      default:
        return isInline(element);
    }
  }
}
