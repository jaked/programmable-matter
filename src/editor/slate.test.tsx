/** @jsx jsx */
import { Editor, Element, Node, Transforms } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import * as PMAST from '../PMAST';

// tests to understand how Slate works

function expectEditor(e1: JSX.Element, action: (e: Editor) => void, e2: JSX.Element) {
  const ed1 = e1 as unknown as Editor;
  const ed2 = e2 as unknown as Editor;
  Editor.normalize(ed1);
  Editor.normalize(ed2);
  action(ed1);
  expect(ed1.children).toStrictEqual(ed2.children);
  expect(ed1.selection).toStrictEqual(ed2.selection);
}

describe('Transforms.splitNodes', () => {
  it('splits block', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>bar</p>
      </editor>,

      editor => Transforms.splitNodes(editor),

      <editor>
        <p>foo</p>
        <p><cursor/>bar</p>
      </editor>
    );
  });

  it('splits both block and inline', () => {
    expectEditor(
      <editor>
        <p><stext bold={true}>foo<cursor/>bar</stext></p>
      </editor>,

      editor => Transforms.splitNodes(editor),

      <editor>
        <p><stext bold={true}>foo</stext></p>
        <p><stext bold={true}><cursor/>bar</stext></p>
      </editor>
    );
  });

  it('splits highest block in highest mode', () => {
    expectEditor(
      <editor>
        <h1><p>foo<cursor/>bar</p></h1>
      </editor>,

      editor => Transforms.splitNodes(editor, {
        mode: 'highest'
      }),

      <editor>
        <h1><p>foo</p></h1>
        <h1><p><cursor/>bar</p></h1>
      </editor>
    );
  });

  it('splits matching block', () => {
    expectEditor(
      <editor>
        <p><h1><p>foo<cursor/>bar</p></h1></p>
      </editor>,

      editor => Transforms.splitNodes(editor, {
        match: n => Element.isElement(n) && n.type === 'h1'
      }),

      <editor>
        <p>
          <h1><p>foo</p></h1>
          <h1><p><cursor/>bar</p></h1>
        </p>
      </editor>
    );
  });

  it('no split at edge of block', () => {
    expectEditor(
      <editor>
        <p><cursor/>foo</p>
      </editor>,

      editor => Transforms.splitNodes(editor),

      <editor>
        <p><cursor/>foo</p>
      </editor>
    );
  });
});

describe('Transforms.insertNodes', () => {
  it('insert block inside block splits block', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>bar</p>
      </editor>,

      editor => {
        Transforms.insertNodes(editor, <h1>baz</h1> as unknown as Node)
      },

      <editor>
        <p>foo</p>
        <h1>baz<cursor/></h1>
        <p>bar</p>
      </editor>
    );
  });

  it(`insert block at edge of block inserts following`, () => {
    expectEditor(
      <editor>
        <p>foo<cursor/></p>
      </editor>,

      editor => {
        Transforms.insertNodes(editor, <h1>baz</h1> as unknown as Node)
      },

      <editor>
        <p>foo</p>
        <h1>baz<cursor/></h1>
      </editor>
    );
  });

  it(`insert inline inside block inserts inside`, () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>bar</p>
      </editor>,

      editor => {
        Transforms.insertNodes(editor, <stext bold={true}>baz</stext> as unknown as Node)
      },

      <editor>
        <p>foo<stext bold={true}>baz<cursor/></stext>bar</p>
      </editor>
    );
  });

  it(`insert multiple nodes leaves cursor after the first node :(`, () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>bar</p>
      </editor>,

      editor => {
        Transforms.insertNodes(editor, [
          <stext>baz</stext>,
          <stext bold={true}>quux</stext>,
        ] as unknown as Node[]);
      },

      <editor>
        <p>
          foobaz<cursor/>
          <stext bold={true}>quux</stext>
          bar
        </p>
      </editor>
    );
  })
});

describe('Transforms.unwrapNodes', () => {
  it('unwrapping empty inline node moves cursor to previous node :(', () => {
    // this happens because the default normalization code sees 3 empty nodes
    // and deletes the first two
    // the cursor is in the second so gets moved to the previous parent
    expectEditor(
      <editor>
        <p><stext/><a href="https://foo.bar/">link</a><stext/></p>
        <p><stext/><a href="https://foo.bar/"><cursor/></a><stext/></p>
      </editor>,

      editor => {
        Transforms.unwrapNodes(editor, {
          match: node => PMAST.isLink(node as PMAST.Node)
        })
      },

      <editor>
        <p><stext/><a href="https://foo.bar/">link</a><cursor/></p>
        <p><stext/></p>
      </editor>
    );
  });
});
