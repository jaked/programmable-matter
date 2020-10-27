/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { insertText } from './insertText';
import { isInline } from './isInline';

describe('Markdown shortcuts', () => {
  it('sets type to header on #', () => {
    const editor = <editor>
      <p>#<cursor /></p>
    </editor> as unknown as Editor;
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <h1><stext></stext></h1>
    ]);
  });
});

describe('urls', () => {
  it('inserts text if text is not url', () => {
    const editor = <editor>
      <p>foo<cursor/></p>
    </editor> as unknown as Editor;
    insertText(editor)('bar');
    expect(editor.children).toEqual([
      <p>foobar</p>
    ])
  });

  it('wraps selection in link if selection expanded', () => {
    const editor = <editor>
      <p><anchor />foo<focus /></p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)('https://foo.bar');
    expect(editor.children).toEqual([
      <p>
        <stext></stext>
        <a href='https://foo.bar'>foo</a>
        <stext></stext>
      </p>
    ])
  });

  it('inserts link if selection collapsed', () => {
    const editor = <editor>
      <p><cursor /></p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)('https://foo.bar');
    expect(editor.children).toEqual([
      <p>
        <stext></stext>
        <a href='https://foo.bar'>https://foo.bar</a>
        <stext></stext>
      </p>
    ])
  });

  it(`doesn't double-wrap link`, () => {
    const editor = <editor>
      <p><a href='https://bar.foo'><cursor /></a></p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)('https://foo.bar');
    expect(editor.children).toEqual([
      <p>
        <stext></stext>
        <a href='https://foo.bar'>https://foo.bar</a>
        <stext></stext>
      </p>
    ])
  });

  it('inserts link on trailing space', () => {
    const editor = <editor>
      <p>https://foo.bar<cursor /></p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <p>
        <stext></stext>
        <a href='https://foo.bar'>https://foo.bar</a>
        <stext> </stext>
      </p>
    ])
  });
});
