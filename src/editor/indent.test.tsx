/** @jsx jsx */
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { indent } from './indent';

it(`indents initial item`, () => {
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
        <li>
          <p></p>
          <ul>
            <li><p><cursor/>foo</p></li>
          </ul>
        </li>
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
