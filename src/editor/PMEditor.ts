import { Editor } from 'slate';

import { deleteBackward } from './deleteBackward';
import { insertBreak } from './insertBreak';
import { insertText } from './insertText';
import { isInline } from './isInline';
import { normalizeNode } from './normalizeNode';

export * from './dedent';
export * from './exitBreak';
export * from './indent';
export * from './setType';
export * from './softBreak';
export * from './toggleMark';

export const withPMEditor = (editor: Editor) => {
  editor.normalizeNode = normalizeNode(editor);
  editor.deleteBackward = deleteBackward(editor);
  editor.insertBreak = insertBreak(editor);
  editor.insertText = insertText(editor);
  editor.isInline = isInline(editor);

  return editor;
}
