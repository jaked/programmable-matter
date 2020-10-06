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
  describe('toggleMark', () => {
    it('toggles mark on at cursor', () => {
      const editor = makePMEditor();
      editor.toggleMark('bold');
      expect(editor.marks && 'bold' in editor.marks && editor.marks.bold).toBeTruthy();
    });

    it('toggles mark off at cursor', () => {
      const editor = makePMEditor();
      editor.addMark('bold', true);
      editor.toggleMark('bold');
      expect(editor.marks && !('bold' in editor.marks)).toBeTruthy();
    });

    it('toggles mark on when selection is unmarked', () => {
      const editor = makePMEditor({
        children: [
          { type: 'p', children: [{ text: 'foobarbaz' }] },
        ],
        selection: {
          anchor: { path: [0, 0], offset: 3 },
          focus: { path: [0, 0], offset: 6 },
        }
      });
      editor.toggleMark('bold');
      expect(editor.children).toEqual([ { type: 'p', children: [
        { text: 'foo' },
        { text: 'bar', bold: true },
        { text: 'baz' },
      ] } ]);
    });

    it('toggles mark on when selection is partially marked', () => {
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
      editor.toggleMark('bold');
      expect(editor.children).toEqual([ { type: 'p', children: [
        { text: 'foobar', bold: true },
        { text: 'baz' },
      ] } ]);
    });

    it('toggles mark off when selection is marked', () => {
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
      editor.toggleMark('bold');
      expect(editor.children).toEqual([ { type: 'p', children: [
        { text: 'foobarbaz' },
      ] } ]);
    });
  });

  describe('setType', () => {
    it('sets header type at cursor', () => {
      const editor = makePMEditor();
      editor.setType('h1');
      expect(editor.children).toEqual([
        { type: 'h1', children: [ { text: ''} ] }
      ]);
    });

    it('sets header type in selection', () => {
      const editor = makePMEditor({
        children: [
          { type: 'p', children: [ { text: 'foo'} ]},
          { type: 'p', children: [ { text: 'bar'} ]},
          { type: 'p', children: [ { text: 'baz'} ]},
        ],
        selection: {
          anchor: { path: [1, 0], offset: 0 },
          focus: { path: [2, 0], offset: 1 },
        }
      });
      editor.setType('h1');
      expect(editor.children).toEqual([
        { type: 'p', children: [ { text: 'foo' } ] },
        { type: 'h1', children: [ { text: 'bar'} ] },
        { type: 'h1', children: [ { text: 'baz'} ] },
      ]);
    });
  });
});
