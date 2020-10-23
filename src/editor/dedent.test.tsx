/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { dedent } from './dedent';

describe('nested list item', () => {
  it('unnests single item', () => {
    const editor = <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><cursor />bar</p></li>
          </ul>
        </li>
        <li><p>baz</p></li>
      </ul>
    </editor> as unknown as Editor;
    dedent(editor);
    expect(editor.children).toEqual([
      <ul>
        <li><p>foo</p></li>
        <li><p>bar</p></li>
        <li><p>baz</p></li>
      </ul>
    ]);
  });

  it('unnests item with following siblings', () => {
    const editor = <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><cursor />bar</p></li>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor> as unknown as Editor;
    dedent(editor);
    expect(editor.children).toEqual([
      <ul>
        <li><p>foo</p></li>
        <li>
          <p>bar</p>
          <ul>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    ]);
  });

  it('unnests item without following siblings', () => {
    const editor = <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p>bar</p></li>
            <li><p><cursor />baz</p></li>
          </ul>
        </li>
      </ul>
    </editor> as unknown as Editor;
    dedent(editor);
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
});

describe('top-level list item', () => {
  it('unwraps item', () => {
    const editor = <editor>
      <ul>
        <li><p>foo</p></li>
        <li><p><cursor />bar</p></li>
        <li><p>baz</p></li>
      </ul>
    </editor> as unknown as Editor;
    dedent(editor);
    expect(editor.children).toEqual([
      <ul>
        <li><p>foo</p></li>
      </ul>,
      <p>bar</p>,
      <ul>
        <li><p>baz</p></li>
      </ul>,
    ]);
  });
});
