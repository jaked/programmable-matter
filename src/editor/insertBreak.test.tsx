/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { insertBreak } from './insertBreak';

describe('in list item', () => {
  it('splits item', () => {
    const editor = <editor>
      <ul>
        <li><p>foo<cursor/>bar</p></li>
      </ul>
    </editor> as unknown as Editor;
    insertBreak(editor)();
    expect(editor.children).toEqual([
      <ul>
        <li><p>foo</p></li>
        <li><p>bar</p></li>
      </ul>
    ]);
  });

  it('dedents when item is empty', () => {
    const editor = <editor>
      <ul>
        <li><p><cursor /></p></li>
      </ul>
    </editor> as unknown as Editor;
    insertBreak(editor)();
    expect(editor.children).toEqual([
      // explicit stext is necessary because slate-hyperscript
      // doesn't apply normalization
      <p><stext></stext></p>
    ]);
  });
});
