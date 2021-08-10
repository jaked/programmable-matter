/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { insertBreak } from './insertBreak';

describe('in link', () => {
  it('breaks outside of link', () => {
    expectEditor(
      <editor>
        <p><a href="https://foo.bar/">link<cursor/></a></p>
      </editor>,

      editor => insertBreak(editor)(),

      <editor>
        <p><a href="https://foo.bar/">link</a><cursor/></p>
        <p/>
      </editor>
    );
  });
});

describe('in list item', () => {
  it('inserts new item when cursor at start of item', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>,

      editor => {
        insertBreak(editor)();
      },

      <editor>
        <ul>
          <li><p></p></li>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>
    );
  });

  it('inserts new item when cursor at start of item, leaves nested list alone', () => {
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

      editor => {
        insertBreak(editor)();
      },

      <editor>
        <ul>
          <li><p></p></li>
          <li>
            <p><cursor/>foo</p>
            <ul>
              <li><p>bar</p></li>
            </ul>
          </li>
        </ul>
      </editor>
    );
  });

  it('splits item when cursor in middle of item', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p>foo<cursor/>bar</p></li>
        </ul>
      </editor>,

      editor => {
        insertBreak(editor)();
      },

      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><cursor/>bar</p></li>
        </ul>
      </editor>
    );
  });

  it('dedents when item is empty', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p><cursor /></p></li>
        </ul>
      </editor>,

      editor => {
        insertBreak(editor)();
      },

      <editor>
        <p><cursor/></p>
      </editor>
    );
  });
});

describe('in header', () => {
  it('breaks to paragraph block', () => {
    expectEditor(
      <editor>
        <h1>foo<cursor /></h1>
      </editor>,

      editor => {
        insertBreak(editor)();
      },

      <editor>
        <h1>foo</h1>
        <p><cursor/></p>
      </editor>
    );
  });
});

describe('in code', () => {
  it('inserts soft break', () => {
    expectEditor(
      <editor>
        <code>foo<cursor />bar</code>
      </editor>,

      editor => {
        insertBreak(editor)();
      },

      <editor>
        <code>foo{'\n'}<cursor/>bar</code>
      </editor>
    );
  });
});
