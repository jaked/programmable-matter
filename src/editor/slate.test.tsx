/** @jsx jsx */
import { Editor, Element, Node, Transforms } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';

// tests to understand how Slate works

describe('Transforms.splitNodes', () => {
  it('splits block', () => {
    const editor = <editor>
      <p>foo<cursor/>bar</p>
    </editor> as unknown as Editor;
    Transforms.splitNodes(editor);
    expect(editor.children).toEqual([
      <p>foo</p>,
      <p>bar</p>,
    ]);
  });

  it('splits both block and inline', () => {
    const editor = <editor>
      <p><stext bold={true}>foo<cursor/>bar</stext></p>
    </editor> as unknown as Editor;
    Transforms.splitNodes(editor);
    expect(editor.children).toEqual([
      <p><stext bold={true}>foo</stext></p>,
      <p><stext bold={true}>bar</stext></p>,
    ]);
  });

  it('splits highest block in highest mode', () => {
    const editor = <editor>
      <h1><p>foo<cursor/>bar</p></h1>
    </editor> as unknown as Editor;
    Transforms.splitNodes(editor, {
      mode: 'highest'
    });
    expect(editor.children).toEqual([
      <h1><p>foo</p></h1>,
      <h1><p>bar</p></h1>,
    ]);
  });

  it('splits matching block', () => {
    const editor = <editor>
      <p><h1><p>foo<cursor/>bar</p></h1></p>
    </editor> as unknown as Editor;
    Transforms.splitNodes(editor, {
      match: n => Element.isElement(n) && n.type === 'h1'
    });
    expect(editor.children).toEqual([
      <p>
        <h1><p>foo</p></h1>
        <h1><p>bar</p></h1>
      </p>
    ]);
  });

  it('no split at edge of block', () => {
    const editor = <editor>
      <p><cursor/>foo</p>
    </editor> as unknown as Editor;
    Transforms.splitNodes(editor);
    expect(editor.children).toEqual([
      <p>foo</p>,
    ]);
  });
});

describe('Transforms.insertNodes', () => {
  it('insert block inside block splits block', () => {
    const editor = <editor>
      <p>foo<cursor/>bar</p>
    </editor> as unknown as Editor;
    Transforms.insertNodes(editor, <h1>baz</h1> as unknown as Node);
    expect(editor.children).toEqual([
      <p>foo</p>,
      <h1>baz</h1>,
      <p>bar</p>,
    ]);
  });

  it(`insert block at edge of block inserts following`, () => {
    const editor = <editor>
      <p>foo<cursor/></p>
    </editor> as unknown as Editor;
    Transforms.insertNodes(editor, <h1>baz</h1> as unknown as Node);
    expect(editor.children).toEqual([
      <p>foo</p>,
      <h1>baz</h1>,
    ]);
  });

  it(`insert inline inside block inserts inside`, () => {
    const editor = <editor>
      <p>foo<cursor/>bar</p>
    </editor> as unknown as Editor;
    Transforms.insertNodes(editor, <stext bold={true}>baz</stext> as unknown as Node);
    expect(editor.children).toEqual([
      <p>foo<stext bold={true}>baz</stext>bar</p>,
    ]);
  });
});
