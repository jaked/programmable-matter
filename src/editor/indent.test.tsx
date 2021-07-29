/** @jsx jsx */
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { indent } from './indent';

it(`does not indent initial item`, () => {
  expectEditor(
    <editor>
      <ul>
        <li><p><cursor/>foo</p></li>
        <li><p>bar</p></li>
        <li><p>baz</p></li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li><p><cursor/>foo</p></li>
        <li><p>bar</p></li>
        <li><p>baz</p></li>
      </ul>
    </editor>
  );
});

it('nests list item', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li><p><cursor />bar</p></li>
        <li><p>baz</p></li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><cursor/>bar</p></li>
          </ul>
        </li>
        <li><p>baz</p></li>
      </ul>
    </editor>
  );
});

it('nests list item under previous', () => {
  expectEditor(
    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p>bar</p></li>
          </ul>
        </li>
        <li><p><cursor/>baz</p></li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p>bar</p></li>
            <li><p><cursor/>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});

it('does not indent nested items', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li>
          <p><cursor/>bar</p>
          <ul>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><cursor/>bar</p></li>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});

it('indents single item when selection is expanded', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li><p><anchor/>bar<focus/></p></li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><anchor/>bar<focus/></p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});

it('indents multiple items', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li><p><anchor/>bar</p></li>
        <li><p>baz<focus/></p></li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><anchor/>bar</p></li>
            <li><p>baz<focus/></p></li>
          </ul>
        </li>
      </ul>
    </editor>
  );
});

it(`doesn't indent item in hanging selection`, () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li><p><anchor/>bar</p></li>
        <li><p><focus/>baz</p></li>
      </ul>
    </editor>,

    editor => {
      indent(editor);
    },

    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li><p><anchor/>bar</p></li>
          </ul>
        </li>
        <li><p><focus/>baz</p></li>
      </ul>
    </editor>
  );
});
