/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { insertText } from './insertText';

it('sets type to header on # shortcut', () => {
  const editor = <editor>
    <p>#<cursor /></p>
  </editor> as unknown as Editor;
  insertText(editor)(' ');
  expect(editor.children).toEqual([
    <h1><stext></stext></h1>
  ]);
});
