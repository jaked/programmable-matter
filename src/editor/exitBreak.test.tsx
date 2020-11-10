/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { exitBreak } from './exitBreak';

it('breaks out of code block', () => {
  const editor = <editor>
    <code>foo<cursor/>bar</code>
  </editor> as unknown as Editor;
  exitBreak(editor);
  expect(editor.children).toEqual([
    <code>foobar</code>,
    <p><stext></stext></p>,
  ]);
  const cursor = { path: [1, 0], offset: 0 }
  expect(editor.selection).toEqual({ anchor: cursor, focus: cursor });
});
