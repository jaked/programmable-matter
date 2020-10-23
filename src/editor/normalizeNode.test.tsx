/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { normalizeNode } from './normalizeNode';

it('merges adjacent lists', () => {
  const editor = <editor>
    <ul>
      <li><p>foo</p></li>
    </ul>
    <ul>
      <li><p>bar</p></li>
    </ul>
  </editor> as unknown as Editor;
  editor.normalizeNode = normalizeNode(editor);
  Editor.normalize(editor, { force: true });
  expect(editor.children).toEqual([
    <ul>
      <li><p>foo</p></li>
      <li><p>bar</p></li>
    </ul>
  ]);
});
