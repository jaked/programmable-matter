/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { insertText } from './insertText';
import { isInline } from './isInline';
import { expectEditor } from './expectEditor';

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

  it('sets type to code on {{{', () => {
    const editor = <editor>
      <p>{'{{{'}<cursor /></p>
    </editor> as unknown as Editor;
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <code><stext></stext></code>
    ]);
  });

  it('sets mark to bold on ** / **', () => {
    const editor = <editor>
      <p>foo**bar**<cursor /></p>
    </editor> as unknown as Editor;
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <p>
        foo
        <stext bold={true}>bar</stext>
        <stext> </stext>
      </p>
    ]);
  });

  it('sets type to inlineCode on { / }', () => {
    const editor = <editor>
      <p>foo{'{bar}'}<cursor />baz</p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <p>
        foo
        <inlineCode>bar</inlineCode>
        <stext> baz</stext>
      </p>
    ]);
  });

  it('ignores shortcuts inside code', () => {
    const editor = <editor>
      <code>foo{'{bar}'}<cursor /></code>
    </editor> as unknown as Editor;
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <code>foo{'{bar}'} </code>
    ]);
  });

  it('sets type to inlineCode on { / } with no trailing text', () => {
    const editor = <editor>
      <p>foo{'{bar}'}<cursor /></p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <p>
        foo
        <inlineCode>bar</inlineCode>
        <stext> </stext>
      </p>
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

  it(`doesn't insert link on trailing space if already linked`, () => {
    const editor = <editor>
      <p>
        <a href='https://foo.bar'>https://foo.bar</a><cursor />
      </p>
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

  it(`doesn't insert link on trailing space inside link`, () => {
    const editor = <editor>
      <p>
        <a href='https://foo.bar'>https://foo.bar<cursor /></a>
      </p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <p>
        <stext></stext>
        <a href='https://foo.bar'>https://foo.bar </a>
        <stext></stext>
      </p>
    ])
  });

  it('inserts link on [[ / ]]', () => {
    const editor = <editor>
      <p>[[/foo]]<cursor /></p>
    </editor> as unknown as Editor;
    editor.isInline = isInline(editor);
    insertText(editor)(' ');
    expect(editor.children).toEqual([
      <p>
        <stext></stext>
        <a href='/foo'>/foo</a>
        <stext> </stext>
      </p>
    ]);
  });
});

describe('inlines', () => {
/*
  it('inserts inside inline when cursor at end', () => {
    expectEditor(
      <editor>
        <p>
          foo <inlineCode>bar<cursor/></inlineCode> baz
        </p>
      </editor>,
      editor => {
        editor.isInline = isInline(editor);
        editor.insertText('quux');
      },
      <editor>
        <p>
          foo <inlineCode>barquux<cursor/></inlineCode> baz
        </p>
      </editor>,
    )
  });
*/
  it('inserts outside inline when cursor after', () => {
    expectEditor(
      <editor>
        <p>
          foo <inlineCode>bar</inlineCode><cursor/> baz
        </p>
      </editor>,
      editor => {
        editor.isInline = isInline(editor);
        editor.insertText('quux');
      },
      <editor>
        <p>
          foo <inlineCode>bar</inlineCode>quux<cursor/> baz
        </p>
      </editor>,
    )
  });
});
