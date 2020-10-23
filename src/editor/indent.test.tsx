/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { indent } from './indent';

it('nests list item', () => {
  const editor = <editor>
    <ul>
      <li><p>foo</p></li>
      <li><p><cursor />bar</p></li>
      <li><p>baz</p></li>
    </ul>
  </editor> as unknown as Editor;
  indent(editor);
  expect(editor.children).toEqual([
    <ul>
      <li>
        <p>foo</p>
        <ul>
          <li><p>bar</p></li>
        </ul>
      </li>
      <li><p>baz</p></li>
    </ul>
  ]);
});
