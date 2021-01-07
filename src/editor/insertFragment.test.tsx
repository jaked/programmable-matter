/** @jsx jsx */
import { Editor, Node } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { insertFragment } from './insertFragment';

describe('insert single text', () => {
  it('inserts text wrapped in list item into paragraph', () => {
    const editor = <editor>
      <p>foo<cursor/>baz</p>
    </editor> as unknown as Editor;
    const fragment =
      <fragment>
        <ul>
          <li><p>bar</p></li>
        </ul>
      </fragment> as unknown as Node[];
    insertFragment(editor)(fragment);
    expect(editor.children).toEqual([
      <p>foobarbaz</p>
    ])
  });

  it('inserts paragraph with marked text into paragraph', () => {
    const editor = <editor>
      <p>foo<cursor/>quux</p>
    </editor> as unknown as Editor;
    const fragment =
      <fragment>
        <p>
          <stext bold={true}>bar</stext>
          baz
        </p>
      </fragment> as unknown as Node[];
    insertFragment(editor)(fragment);
    expect(editor.children).toEqual([
      <p>
        foo
        <stext bold={true}>bar</stext>
        bazquux
      </p>
    ])
  });
});

describe('insert paragraphs', () => {
  it('into the middle of paragraph splits paragraph', () => {
    const editor = <editor>
      <p>foo<cursor/>baz</p>
    </editor> as unknown as Editor;
    const fragment =
      <fragment>
        <p>bar</p>
        <p>quux</p>
      </fragment> as unknown as Node[];
    insertFragment(editor)(fragment);
    expect(editor.children).toEqual([
      <p>foo</p>,
      <p>bar</p>,
      <p>quux</p>,
      <p>baz</p>,
    ]);
  });
});
