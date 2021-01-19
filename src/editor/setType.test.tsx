/** @jsx jsx */
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { setType } from './setType';

describe('header', () => {
  it('sets header type at cursor', () => {
    expectEditor(
      <editor>
        <p><cursor/>foo</p>
      </editor>,

      editor => { setType(editor, 'h1'); },

      <editor>
        <h1><cursor/>foo</h1>
      </editor>
    );
  });

  it('sets header type in selection', () => {
    expectEditor(
      <editor>
        <p>foo</p>
        <p><anchor/>bar</p>
        <p>baz<focus/></p>
      </editor>,

      editor => { setType(editor, 'h1'); },

      <editor>
        <p>foo</p>
        <h1><anchor/>bar</h1>
        <h1>baz<focus/></h1>
      </editor>
    );
  });
});

describe('list', () => {
  it('wraps list type', () => {
    expectEditor(
      <editor>
        <p><cursor/>foo</p>
      </editor>,

      editor => { setType(editor, 'ul'); },

      <editor>
        <ul>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>
    );
  });

  it(`doesn't wrap list type more than once`, () => {
    expectEditor(
      <editor>
        <ul>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>,

      editor => { setType(editor, 'ol'); },

      <editor>
        <ol>
          <li><p><cursor/>foo</p></li>
        </ol>
      </editor>
    );
  });

  it('unwraps list type', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>,

      editor => { setType(editor, 'p'); },

      <editor>
        <p><cursor/>foo</p>
      </editor>
    );
  });

  it(`splits and unwraps multi-item list`, () => {
    expectEditor(
      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><cursor />bar</p></li>
          <li><p>baz</p></li>
        </ul>
      </editor>,

      editor => { setType(editor, 'p'); },

      <editor>
        <ul>
          <li><p>foo</p></li>
        </ul>
        <p><cursor/>bar</p>
        <ul>
          <li><p>baz</p></li>
        </ul>
      </editor>
    );
  });
});

describe('blockquote', () => {
  it('wraps blockquote', () => {
    expectEditor(
      <editor>
        <p><cursor/></p>
      </editor>,

      editor => { setType(editor, 'blockquote'); },

      <editor>
        <blockquote>
          <p><cursor/></p>
        </blockquote>
      </editor>
    );
  });
});
