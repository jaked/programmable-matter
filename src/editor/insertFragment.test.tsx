/** @jsx jsx */
import { Node } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { isInline } from './isInline';
import { insertFragment } from './insertFragment';

describe('insert single text', () => {
  it('inserts text wrapped in list item into paragraph', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>baz</p>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <ul>
              <li><p>bar</p></li>
            </ul>
          </fragment> as unknown as Node[]
        );
      },

      <editor>
        <p>foobar<cursor/>baz</p>
      </editor>
    );
  });

  it('inserts paragraph with marked text into paragraph', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>quux</p>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <p>
              <stext bold={true}>bar</stext>
              baz
            </p>
          </fragment> as unknown as Node[]
        );
      },

      <editor>
        <p>
          foo
          <stext bold={true}>bar</stext>
          baz<cursor/>quux
        </p>
      </editor>
    );
  });
});

describe('insert paragraphs', () => {
  it('into the middle of paragraph splits paragraph', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>baz</p>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <p>bar</p>
            <p>quux</p>
          </fragment> as unknown as Node[]
        );
      },

      <editor>
        <p>foo</p>
        <p>bar</p>
        <p>quux</p>
        <p><cursor/>baz</p>
      </editor>
    );
  });
});

describe('insert list items', () => {
  it('inserts list items at top level', () => {
    expectEditor(
      <editor>
        <p>foo<cursor/>quux</p>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <ul>
              <li><p>bar</p></li>
              <li><p>baz</p></li>
            </ul>
          </fragment> as unknown as Node[]
        );
      },

      <editor>
        <p>foo</p>
        <ul>
          <li><p>bar</p></li>
          <li><p>baz</p></li>
        </ul>
        <p><cursor/>quux</p>
      </editor>
    )
  });

  it('inserts list items at start of list item', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <ul>
              <li><p>bar</p></li>
              <li><p>baz</p></li>
            </ul>
          </fragment> as unknown as Node[]
        );
      },

      <editor>
        <ul>
          <li><p>bar</p></li>
          <li><p>baz</p></li>
          <li><p><cursor/>foo</p></li>
        </ul>
      </editor>
    )
  });

  it('inserts list items into middle of list item', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p>foo<cursor/>quux</p></li>
        </ul>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <ul>
              <li><p>bar</p></li>
              <li><p>baz</p></li>
            </ul>
          </fragment> as unknown as Node[]
        );
      },

      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p>bar</p></li>
          <li><p>baz</p></li>
          <li><p><cursor/>quux</p></li>
        </ul>
      </editor>
    )
  });

  it('inserts list items at end of list item', () => {
    expectEditor(
      <editor>
        <ul>
          <li><p>foo<cursor/></p></li>
        </ul>
      </editor>,

      editor => {
        insertFragment(editor)(
          <fragment>
            <ul>
              <li><p>bar</p></li>
              <li><p>baz</p></li>
            </ul>
          </fragment> as unknown as Node[]
        );
      },

      // TODO(jaked) cursor should go after baz
      <editor>
        <ul>
          <li><p>foo</p></li>
          <li><p>bar</p></li>
          <li><p>baz<cursor/></p></li>
        </ul>
      </editor>
    )
  });
});

describe('insert links', () => {
  it('pastes link as link', () => {
    expectEditor(
      <editor>
        <p><cursor/></p>
      </editor>,

      editor => {
        editor.isInline = isInline(editor);
        insertFragment(editor)(
          <fragment>
            <p><a href="https://foo.bar">link</a></p>
          </fragment> as unknown as Node[]
        )
      },

      <editor>
        <p><a href="https://foo.bar">link</a><cursor/></p>
      </editor>
    )
  });
});
