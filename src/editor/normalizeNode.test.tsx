/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { normalizeNode } from './normalizeNode';
import { isInline } from './isInline';

function expectEditor(e1: JSX.Element, action: (e: Editor) => void, e2: JSX.Element) {
  const ed1 = e1 as unknown as Editor;
  const ed2 = e2 as unknown as Editor;
  Editor.normalize(ed1);
  Editor.normalize(ed2);
  action(ed1);
  expect(ed1.children).toStrictEqual(ed2.children);
  expect(ed1.selection).toStrictEqual(ed2.selection);
}

it('merges adjacent lists', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
      </ul>
      <ul>
        <li><p>bar</p></li>
      </ul>
    </editor>,

    editor => {
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <ul>
        <li><p>foo</p></li>
        <li><p>bar</p></li>
      </ul>
    </editor>
  );
});

it('merges adjacent lists after indent', () => {
  expectEditor(
    <editor>
      <ul>
        <li>
          <p>baz</p>
          <ul>
            <li><p>foo</p></li>
          </ul>
        </li>
        <li>
          <ul>
            <li><p>bar</p></li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <ul>
        <li>
          <p>baz</p>
          <ul>
            <li><p>foo</p></li>
            <li><p>bar</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});

it('merges adjacent blockquotes', () => {
  expectEditor(
    <editor>
      <blockquote>
        <p>foo</p>
      </blockquote>
      <blockquote>
        <p>bar</p>
      </blockquote>
    </editor>,

    editor => {
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <blockquote>
        <p>foo</p>
        <p>bar</p>
      </blockquote>
    </editor>
  );
});

it('drops empty links', () => {
  expectEditor(
    <editor>
      <p><stext/><a href="https://foo.bar/">link</a><stext/></p>
      <p><stext/><a href="https://foo.bar/"><cursor/></a><stext/></p>
    </editor>,

    editor => {
      editor.isInline = isInline(editor);
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <p><stext/><a href="https://foo.bar/">link</a><stext/></p>
      <p><cursor/></p>
    </editor>
  )
});

it('drops empty inlineCode nodes', () => {
  expectEditor(
    <editor>
      <p><stext/><inlineCode><cursor/></inlineCode><stext/></p>
    </editor>,

    editor => {
      editor.isInline = isInline(editor);
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <p><cursor/></p>
    </editor>
  )
});

it('merges list item with missing initial paragraph', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li>
          <ul>
            <li><p>bar</p></li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p>bar</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});

it('dedents initial list item with missing initial paragraph', () => {
  expectEditor(
    <editor>
      <ul>
        <li>
          <ul>
            <li><p>foo</p></li>
            <li><p>bar</p></li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      editor.normalizeNode = normalizeNode(editor);
      Editor.normalize(editor, { force: true });
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p>bar</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});
