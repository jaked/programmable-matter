import { Editor } from 'slate';

export const softBreak = (editor: Editor) => {
  editor.insertText('\n');
}
