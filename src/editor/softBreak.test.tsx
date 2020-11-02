/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { softBreak } from './softBreak';

it('inserts a newline into a paragraph', () => {
  const editor = <editor>
    <p>foo<cursor /></p>
  </editor> as unknown as Editor;
  softBreak(editor);
  expect(editor.children).toEqual([
    <p>foo{'\n'}</p>
  ]);
});
