/** @jsx jsx */
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { dedent } from './dedent';

describe('blockquote', () => {
  it('lifts block out of quote', () => {
    expectEditor(
      <editor>
        <blockquote>
          <p>foo</p>
          <p><cursor/>bar</p>
          <p>baz</p>
        </blockquote>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <blockquote>
          <p>foo</p>
        </blockquote>
        <p><cursor/>bar</p>
        <blockquote>
          <p>baz</p>
        </blockquote>
      </editor>
    );
  });
});

describe('nested list item', () => {
  it('unnests single item', () => {
    expectEditor(
      <editor>
        <ul>
          <li>
            <p>foo</p>
            <ul>
              <li><p><cursor />bar</p></li>
            </ul>
          </li>
          <li><p>baz</p></li>
        </ul>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><cursor />bar</p></li>
          <li><p>baz</p></li>
        </ul>
      </editor>
    );
  });

  it('unnests item with following siblings', () => {
    expectEditor(
      <editor>
        <ul>
          <li>
            <p>foo</p>
            <ul>
              <li><p><cursor />bar</p></li>
              <li><p>baz</p></li>
            </ul>
          </li>
        </ul>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <ul>
          <li><p>foo</p></li>
          <li>
            <p><cursor />bar</p>
            <ul>
              <li><p>baz</p></li>
            </ul>
          </li>
        </ul>
      </editor>
    );
  });

  it('unnests item without following siblings', () => {
    expectEditor(
      <editor>
        <ul>
          <li>
            <p>foo</p>
            <ul>
              <li><p>bar</p></li>
              <li><p><cursor />baz</p></li>
            </ul>
          </li>
        </ul>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <ul>
          <li>
            <p>foo</p>
            <ul>
              <li><p>bar</p></li>
            </ul>
          </li>
          <li><p><cursor />baz</p></li>
        </ul>
      </editor>
    );
  });

  it('dedents single item when selection is expanded', () => {
    expectEditor(
      <editor>
        <ul>
          <li>
            <p>foo</p>
            <ul>
              <li><p><anchor/>bar<focus/></p></li>
            </ul>
          </li>
        </ul>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><anchor/>bar<focus/></p></li>
        </ul>
      </editor>
    );
  });

  it('dedents multiple items', () => {
    expectEditor(
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
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><anchor/>bar</p></li>
          <li><p>baz<focus/></p></li>
        </ul>
      </editor>
    );
  });
});

describe('top-level list item', () => {
  it('unwraps item', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><cursor />bar</p></li>
          <li><p>baz</p></li>
        </ul>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <ul>
          <li><p>foo</p></li>
        </ul>
        <p><cursor />bar</p>
        <ul>
          <li><p>baz</p></li>
        </ul>
      </editor>
    );
  });

  it('unwraps outer top-level item with nested item', () => {
    expectEditor(
      <editor>
        <ul>
          <li>
            <p><cursor/>foo</p>
            <ul>
              <li><p>bar</p></li>
            </ul>
          </li>
        </ul>
      </editor>,

      editor => { dedent(editor); },

      <editor>
        <p><cursor/>foo</p>
        <ul>
          <li><p>bar</p></li>
        </ul>
      </editor>
    );
  });
});
