import { Editor } from 'slate';
import { atStartOfBlock } from './atStartOfBlock';
import { blockIsEmpty } from './blockIsEmpty';
import { dedent } from './dedent';

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;
  return (unit: 'character' | 'word' | 'line' | 'block') => {
    if (atStartOfBlock(editor) && !blockIsEmpty(editor)) {
      dedent(editor);
      return;
    }

    deleteBackward(unit);
  }
}
