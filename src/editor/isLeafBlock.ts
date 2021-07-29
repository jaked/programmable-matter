import { Editor, Element, Node } from 'slate';

// true for blocks that have only inlines / text nodes as children
export const isLeafBlock = (editor: Editor, node: Node) =>
  Element.isElement(node) && !editor.isInline(node) && Editor.hasInlines(editor, node)
