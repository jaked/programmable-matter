/** @jsx jsx */
import { jsx } from '../util/slate-hyperscript-jsx';
import { insertText } from './insertText';
import { isInline } from './isInline';
import { expectEditor } from './expectEditor';

describe('Markdown shortcuts', () => {
  it('sets type to header on #', () => {
    expectEditor(
      <editor>
        <p>#<cursor /></p>
      </editor>,

      editor => {
        insertText(editor)(' ');
      },

      <editor>
        <h1><cursor/></h1>
      </editor>
    );
  });

  it('sets type to liveCode on {{{', () => {
    expectEditor(
      <editor>
        <p>{'{{{'}<cursor /></p>
      </editor>,

      editor => {
        insertText(editor)(' ');
      },

      <editor>
        <liveCode><cursor/></liveCode>
      </editor>
    );
  });

  it('sets mark to bold on ** / **', () => {
    expectEditor(
      <editor>
        <p>foo**bar**<cursor /></p>
      </editor>,

      editor => {
        insertText(editor)(' ');
      },

      <editor>
        <p>
          foo
          <stext bold={true}>bar</stext>
          <stext> <cursor/></stext>
        </p>
      </editor>
    );
  });

  it('sets type to inlineLiveCode on { / }', () => {
    expectEditor(
      <editor>
        <p>foo{'{bar}'}<cursor />baz</p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)(' ');
      },

      <editor>
        <p>
          foo
          <inlineLiveCode>bar</inlineLiveCode>
          <stext> <cursor/>baz</stext>
        </p>
      </editor>
    );
  });

  it('ignores shortcuts inside liveCode', () => {
    expectEditor(
      <editor>
        <liveCode>foo{'{bar}'}<cursor /></liveCode>
      </editor>,

      editor => {
        insertText(editor)(' ');
      },

      <editor>
        <liveCode>foo{'{bar}'} <cursor/></liveCode>
      </editor>
    );
  });

  it('sets type to inlineLiveCode on { / } with no trailing text', () => {
    expectEditor(
      <editor>
        <p>foo{'{bar}'}<cursor /></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)(' ');
      },

      <editor>
        <p>
          foo
          <inlineLiveCode>bar</inlineLiveCode>
          <stext> <cursor/></stext>
        </p>
      </editor>
    );
  });
});

describe('urls', () => {
  it('inserts text if text is not url', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/></p>
      </editor>,

      editor => {
        insertText(editor)('bar');
      },

      <editor>
        <p>foobar<cursor/></p>
      </editor>
    );
  });

  it('wraps selection in link if selection expanded', () => {
    expectEditor(
      <editor>
        <p><anchor />foo<focus /></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)('https://foo.bar');
      },

      <editor>
        <p>
          <a href='https://foo.bar'>foo<cursor/></a>
        </p>
      </editor>
    );
  });

  it('inserts link if selection collapsed', () => {
    expectEditor(
      <editor>
        <p><cursor /></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)('https://foo.bar');
      },

      <editor>
        <p>
          <a href='https://foo.bar'>https://foo.bar<cursor/></a>
        </p>
      </editor>
    );
  });

  it(`splits outer link on insert`, () => {
    expectEditor(
      <editor>
        <p><a href='https://bar.foo'>bar<cursor />foo</a></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)('https://foo.bar');
      },

      // TODO(jaked)
      <editor>
        <p>
          <a href='https://bar.foo'>bar</a>
          <a href='https://foo.bar'>https://foo.bar<cursor/></a>
          <a href='https://bar.foo'>foo</a>
        </p>
      </editor>
    );
  });

  it(`splits outer link on wrap`, () => {
    expectEditor(
      <editor>
        <p><a href='https://bar.foo'>bar<anchor/>baz<focus/>foo</a></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)('https://foo.bar');
      },

      // TODO(jaked)
      <editor>
        <p>
          <a href='https://bar.foo'>bar</a>
          <a href='https://foo.bar'>baz<cursor/></a>
          <a href='https://bar.foo'>foo</a>
        </p>
      </editor>
    );
  });

  it('inserts link on trailing space', () => {
    expectEditor(
      <editor>
        <p>https://foo.bar<cursor /></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)(' ');
      },

      <editor>
        <p>
          <a href='https://foo.bar'>https://foo.bar</a>
          <stext> <cursor/></stext>
        </p>
      </editor>
    );
  });

  it(`doesn't insert link on trailing space if already linked`, () => {
    expectEditor(
      <editor>
        <p>
          <a href='https://foo.bar'>https://foo.bar</a><cursor />
        </p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)(' ');
      },

      <editor>
        <p>
          <a href='https://foo.bar'>https://foo.bar</a>
          <stext> <cursor/></stext>
        </p>
      </editor>
    );
  });

  it(`doesn't insert link on trailing space inside link`, () => {
    expectEditor(
      <editor>
        <p>
          <a href='https://foo.bar'>https://foo.bar<cursor /></a>
        </p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)(' ');
      },

      <editor>
        <p>
          <a href='https://foo.bar'>https://foo.bar</a>
          <stext> <cursor/></stext>
        </p>
      </editor>
    );
  });

  it('inserts link on [[ / ]]', () => {
    expectEditor(
      <editor>
        <p>[[/foo]]<cursor /></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertText(editor)(' ');
      },

      <editor>
        <p>
          <a href='/foo'>/foo</a>
          <stext> <cursor/></stext>
        </p>
      </editor>
    );
  });
});

describe('inlines', () => {
/*
  it('inserts inside inline when cursor at end', () => {
    expectEditor(
      <editor>
        <p>
          foo <inlineLiveCode>bar<cursor/></inlineLiveCode> baz
        </p>
      </editor>,
      editor => {
        editor.isInline = isInline(editor);
        editor.insertText('quux');
      },
      <editor>
        <p>
          foo <inlineLiveCode>barquux<cursor/></inlineLiveCode> baz
        </p>
      </editor>,
    )
  });
*/
  it('inserts outside inline when cursor after', () => {
    expectEditor(
      <editor>
        <p>
          foo <inlineLiveCode>bar</inlineLiveCode><cursor/> baz
        </p>
      </editor>,
      editor => {
        editor.isInline = isInline(editor);
        editor.insertText('quux');
      },
      <editor>
        <p>
          foo <inlineLiveCode>bar</inlineLiveCode>quux<cursor/> baz
        </p>
      </editor>,
    )
  });
});
