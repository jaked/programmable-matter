/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { deleteBackward } from './deleteBackward';

it(`dedents when cursor is at start of header and block is not empty`, () => {
  const editor = <editor>
    <h1><cursor />foo</h1>
  </editor> as unknown as Editor;
  deleteBackward(editor)('character');
  expect(editor.children).toEqual([
    <p>foo</p>
  ]);
});

it(`dedents when cursor is at start of list item and block is not empty`, () => {
  const editor = <editor>
    <ul><li><p><cursor />foo</p></li></ul>
  </editor> as unknown as Editor;
  deleteBackward(editor)('character');
  expect(editor.children).toEqual([
    <p>foo</p>
  ]);
});

it(`deletes backward when block is maximally dedented`, () => {
  const editor = <editor>
    <p>foo</p>
    <p><cursor />bar</p>
  </editor> as unknown as Editor;
  deleteBackward(editor)('character');
  expect(editor.children).toEqual([
    <p>foobar</p>
  ]);
});
