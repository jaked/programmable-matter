/** @jsx jsx */
import { Editor, Node } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { isInline } from './isInline';
import { inListItem } from './inListItem';

it('in list item in link', () => {
  const editor = <editor>
    <ul>
      <li><p><a href="https://foo.bar"><cursor/></a></p></li>
    </ul>
  </editor> as unknown as Editor;
  editor.isInline = isInline(editor);
  expect(inListItem(editor)).toBeTruthy();
});
