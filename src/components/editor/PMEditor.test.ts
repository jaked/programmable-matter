import * as Slate from 'slate';

import * as PMEditor from './PMEditor';

const makeEmptyEditor = () => {
  const editor = PMEditor.withPMEditor(Slate.createEditor());
  editor.children = [{ type: 'p', children: [{ text: '' }] }];
  const point = { path: [0, 0], offset: 0 };
  editor.selection = { anchor: point, focus: point };
  return editor;
}

describe('PMEditor', () => {
  describe('toggleBold', () => {
    it('toggles bold on at cursor', () => {
      const editor = makeEmptyEditor();
      editor.toggleBold();
      expect(editor.marks && 'bold' in editor.marks && editor.marks.bold).toBeTruthy();
    });

    it('toggles bold off at cursor', () => {
      const editor = makeEmptyEditor();
      editor.addMark('bold', true);
      editor.toggleBold();
      expect(editor.marks && !('bold' in editor.marks)).toBeTruthy();
    });
  });
});
