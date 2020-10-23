/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { toggleMark } from './toggleMark';

it('toggles mark on at cursor', () => {
  const editor = <editor>
    <p><cursor /></p>
  </editor> as unknown as Editor;
  toggleMark(editor, 'bold');
  expect(editor.marks && 'bold' in editor.marks && editor.marks.bold).toBeTruthy();
});

it('toggles mark off at cursor', () => {
  const editor = <editor>
    <p><cursor /></p>
  </editor> as unknown as Editor;
  editor.addMark('bold', true);
  toggleMark(editor, 'bold');
  expect(editor.marks && !('bold' in editor.marks)).toBeTruthy();
});

it('toggles mark on when selection is unmarked', () => {
  const editor = <editor>
    <p>
      foo
      <anchor />bar<focus />
      baz
    </p>
  </editor> as unknown as Editor;
  toggleMark(editor, 'bold');
  expect(editor.children).toEqual([
    <p>
      foo
      <stext bold={true}>bar</stext>
      baz
    </p>
  ]);
});

it('toggles mark on when selection is partially marked', () => {
  const editor = <editor>
    <p>
      <anchor />foo
      <stext bold={true}>bar<focus /></stext>
      baz
    </p>
  </editor> as unknown as Editor;
  toggleMark(editor, 'bold');
  expect(editor.children).toEqual([
    <p>
      <stext bold={true}>foobar</stext>
      baz
    </p>
  ]);
});

it('toggles mark off when selection is marked', () => {
  const editor = <editor>
    <p>
      <stext bold={true}><anchor />foobar<focus/></stext>
      baz
    </p>
  </editor> as unknown as Editor;
  toggleMark(editor, 'bold');
  expect(editor.children).toEqual([
    <p>
      foobarbaz
    </p>
  ]);
});
