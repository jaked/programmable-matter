import * as Slate from 'slate';

import * as PMAST from '../../PMAST';
import * as PMEditor from './PMEditor';

const makePMEditor = (props: {
  children?: PMAST.Node[],
  selection?: Slate.Range,
 } = {}) => {
  const editor = PMEditor.withPMEditor(Slate.createEditor());
  editor.children = props.children ?? [{ type: 'p', children: [{ text: '' }] }];
  if (props.selection) {
    editor.selection = props.selection;
  } else {
    const point = { path: [0, 0], offset: 0 };
    editor.selection = { anchor: point, focus: point };
  }
  return editor;
}

describe('PMEditor', () => {
  describe('toggleBold', () => {
    it('toggles bold on at cursor', () => {
      const editor = makePMEditor();
      editor.toggleBold();
      expect(editor.marks && 'bold' in editor.marks && editor.marks.bold).toBeTruthy();
    });

    it('toggles bold off at cursor', () => {
      const editor = makePMEditor();
      editor.addMark('bold', true);
      editor.toggleBold();
      expect(editor.marks && !('bold' in editor.marks)).toBeTruthy();
    });

    it('toggles bold on when selection is unbolded', () => {
      const editor = makePMEditor({
        children: [
          { type: 'p', children: [{ text: 'foobarbaz' }] },
        ],
        selection: {
          anchor: { path: [0, 0], offset: 3 },
          focus: { path: [0, 0], offset: 6 },
        }
      });
      editor.toggleBold();
      expect(editor.children).toEqual([ { type: 'p', children: [
        { text: 'foo' },
        { text: 'bar', bold: true },
        { text: 'baz' },
      ] } ]);
    });

    it('toggles bold on when selection is partially bolded', () => {
      const editor = makePMEditor({
        children: [ { type: 'p', children: [
          { text: 'foo' },
          { text: 'bar', bold: true },
          { text: 'baz' },
        ] } ],
        selection: {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 1], offset: 3 },
        }
      });
      editor.toggleBold();
      expect(editor.children).toEqual([ { type: 'p', children: [
        { text: 'foobar', bold: true },
        { text: 'baz' },
      ] } ]);
    });

    it('toggles bold off when selection is bolded', () => {
      const editor = makePMEditor({
        children: [ { type: 'p', children: [
          { text: 'foobar', bold: true },
          { text: 'baz' },
        ] } ],
        selection: {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 0], offset: 6 },
        }
      });
      editor.toggleBold();
      expect(editor.children).toEqual([ { type: 'p', children: [
        { text: 'foobarbaz' },
      ] } ]);
    });
  });
});
