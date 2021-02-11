/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { deleteBackward } from './deleteBackward';

it(`dedents when cursor is at start of header and block is not empty`, () => {
  expectEditor(
    <editor>
      <h1><cursor/>foo</h1>
    </editor>,

    editor => {
      deleteBackward(editor)('character')
    },

    <editor>
      <p><cursor/>foo</p>
    </editor>
  );
});

it(`dedents when cursor is at start of list item and block is not empty`, () => {
  expectEditor(
    <editor>
      <ul><li><p><cursor/>foo</p></li></ul>
    </editor>,

    editor => {
      deleteBackward(editor)('character')
    },

    <editor>
      <p><cursor/>foo</p>
    </editor>
  );
});

it(`deletes backward when block is maximally dedented`, () => {
  expectEditor(
    <editor>
      <p>foo</p>
      <p><cursor/>bar</p>
    </editor>,

    editor => {
      deleteBackward(editor)('character')
    },

    <editor>
      <p>foo<cursor/>bar</p>
    </editor>
  );
});

it(`delete initial p of list item merges sub-list to prev`, () => {
  // normalizeNode makes this work
  expectEditor(
    <editor>
      <ul>
        <li><p>foo</p></li>
        <li>
          <p><cursor/></p>
          <ul>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      deleteBackward(editor)('character');
    },

    <editor>
      <ul>
        <li>
          <p>foo<cursor/></p>
          <ul>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  )
});

it(`delete initial p of first list item dedents next item`, () => {
  expectEditor(
    <editor>
      <p>foo</p>
      <ul>
        <li>
          <p><cursor/></p>
          <ul>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      deleteBackward(editor)('character');
    },

    <editor>
      <p>foo<cursor/></p>
      <ul>
        <li><p>baz</p></li>
      </ul>
    </editor>
  )
});

it(`delete initial p of first sub-list item dedents next item`, () => {
  expectEditor(
    <editor>
      <ul>
        <li>
          <p>foo</p>
          <ul>
            <li>
              <p><cursor/></p>
              <ul>
                <li><p>baz</p></li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </editor>,

    editor => {
      deleteBackward(editor)('character');
    },

    <editor>
      <ul>
        <li>
          <p>foo<cursor/></p>
          <ul>
            <li><p>baz</p></li>
          </ul>
        </li>
      </ul>
    </editor>
  )
});
