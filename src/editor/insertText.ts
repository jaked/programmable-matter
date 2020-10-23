import { Editor, Range, Transforms } from 'slate';
import { setType } from './setType';

const SHORTCUTS = {
  '*': 'ul',
  '-': 'ul',
  '+': 'ul',
  '1.': 'ol',
  '#': 'h1',
  '##': 'h2',
  '###': 'h3',
  '####': 'h4',
  '#####': 'h5',
  '######': 'h6',
}

export const insertText = (editor: Editor) => {
  const { insertText } = editor;
  return (text: string) => {
    const { selection } = editor;
    if (text === ' ' && selection && Range.isCollapsed(selection)) {
      const above = Editor.above(editor);
      if (above) {
        const [, path] = above;
        const start = Editor.start(editor, path);
        const range = { anchor: selection.anchor, focus: start };
        const beforeText = Editor.string(editor, range);
        const type = SHORTCUTS[beforeText];

        if (type) {
          Transforms.delete(editor, { at: range });
          setType(editor, type);
          return;
        }
      }
    }

    insertText(text);
  }
}