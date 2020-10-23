import { Editor } from 'slate';
import * as PMAST from '../PMAST';

import { dedent } from './dedent';
import { deleteBackward } from './deleteBackward';
import { indent } from './indent';
import { insertBreak } from './insertBreak';
import { insertText } from './insertText';
import { normalizeNode } from './normalizeNode';
import { setType } from './setType';
import { toggleMark } from './toggleMark';

export type PMEditor = Editor & {
  toggleMark(mark: PMAST.mark): void;
  setType(type: PMAST.type): void;
  indent(): void;
  dedent(): void;
}

export const withPMEditor = (editor: Editor) => {
  editor.toggleMark = (mark: PMAST.mark) => {
    toggleMark(editor, mark);
  }
  editor.setType = (type: PMAST.type) => {
    setType(editor, type);
  }

  editor.normalizeNode = normalizeNode(editor);
  editor.deleteBackward = deleteBackward(editor);
  editor.insertBreak = insertBreak(editor);
  editor.insertText = insertText(editor);

  editor.indent = () => indent(editor);
  editor.dedent = () => dedent(editor);

  return editor as PMEditor;
}
