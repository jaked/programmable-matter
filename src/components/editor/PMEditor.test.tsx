/** @jsx jsx */

import * as Slate from 'slate';
import { jsx } from '../../util/slate-hyperscript-jsx';

import * as PMAST from '../../PMAST';
import * as PMEditor from './PMEditor';

const makePMEditor = (props: {
  children?: PMAST.Node[],
  selection?: Slate.Range,
 } = {}) => {
  const editor = PMEditor.withPMEditor(Slate.createEditor());
  editor.children = props.children ?? [{ type: 'p', children: [{ text: '' }] }];
  if (props.selection) {
    editor.selection = props.selection;
  } else {
    const point = { path: [0, 0], offset: 0 };
    editor.selection = { anchor: point, focus: point };
  }
  return editor;
}

// TODO(jaked) fix typechecking of jsx
const makePMEditor2 = (editor: any) => {
  return PMEditor.withPMEditor(editor);
}

describe('PMEditor', () => {
  describe('toggleMark', () => {
    it('toggles mark on at cursor', () => {
      const editor = makePMEditor2(<editor>
        <p><cursor /></p>
      </editor>);
      editor.toggleMark('bold');
      expect(editor.marks && 'bold' in editor.marks && editor.marks.bold).toBeTruthy();
    });

    it('toggles mark off at cursor', () => {
      const editor = makePMEditor2(<editor>
        <p><cursor /></p>
      </editor>);
      editor.addMark('bold', true);
      editor.toggleMark('bold');
      expect(editor.marks && !('bold' in editor.marks)).toBeTruthy();
    });

    it('toggles mark on when selection is unmarked', () => {
      const editor = makePMEditor2(<editor>
        <p>
          foo
          <anchor />bar<focus />
          baz
        </p>
      </editor>);
      editor.toggleMark('bold');
      expect(editor.children).toEqual([
        <p>
          foo
          <stext bold={true}>bar</stext>
          baz
        </p>
      ]);
    });

    it('toggles mark on when selection is partially marked', () => {
      const editor = makePMEditor2(<editor>
        <p>
          <anchor />foo
          <stext bold={true}>bar<focus /></stext>
          baz
        </p>
      </editor>);
      editor.toggleMark('bold');
      expect(editor.children).toEqual([
        <p>
          <stext bold={true}>foobar</stext>
          baz
        </p>
      ]);
    });

    it('toggles mark off when selection is marked', () => {
      const editor = makePMEditor2(<editor>
        <p>
          <stext bold={true}><anchor />foobar<focus/></stext>
          baz
        </p>
      </editor>);
      editor.toggleMark('bold');
      expect(editor.children).toEqual([
        <p>
          foobarbaz
        </p>
      ]);
    });
  });

  describe('setType', () => {
    it('sets header type at cursor', () => {
      const editor = makePMEditor2(<editor>
        <p><cursor />foo</p>
      </editor>);
      editor.setType('h1');
      expect(editor.children).toEqual([
        <h1>foo</h1>
      ]);
    });

    it('sets header type in selection', () => {
      const editor = makePMEditor2(<editor>
        <p>foo</p>
        <p><anchor />bar</p>
        <p>baz<focus/></p>
      </editor>);
      editor.setType('h1');
      expect(editor.children).toEqual([
        <p>foo</p>,
        <h1>bar</h1>,
        <h1>baz</h1>,
      ]);
    });

    it('wraps list type', () => {
      const editor = makePMEditor2(<editor>
        <p><cursor />foo</p>
      </editor>);
      editor.setType('ul');
      expect(editor.children).toEqual([
        <ul>
          <li><p>foo</p></li>
        </ul>
      ]);
    });

    it(`doesn't wrap list type more than once`, () => {
      const editor = makePMEditor2(<editor>
        <ul>
          <li><p><cursor />foo</p></li>
        </ul>
      </editor>);
      editor.setType('ol');
      expect(editor.children).toEqual([
        <ol>
          <li><p>foo</p></li>
        </ol>
      ]);
    });

    it('unwraps list type', () => {
      const editor = makePMEditor2(<editor>
        <ul>
          <li><p><cursor />foo</p></li>
        </ul>
      </editor>);
      editor.setType('p');
      expect(editor.children).toEqual([
        <p>foo</p>
      ]);
    });

    it(`splits and unwraps multi-item list`, () => {
      const editor = makePMEditor2(<editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><cursor />bar</p></li>
          <li><p>baz</p></li>
        </ul>
      </editor>);
      editor.setType('p');
      expect(editor.children).toEqual([
        <ul>
          <li><p>foo</p></li>
        </ul>,
        <p>bar</p>,
        <ul>
          <li><p>baz</p></li>
        </ul>
      ]);
    });

    it(`merges adjacent lists`, () => {
      const editor = makePMEditor2(<editor>
        <ul>
          <li><p>foo</p></li>
        </ul>
        <p><cursor />bar</p>
        <ul>
          <li><p>baz</p></li>
        </ul>
      </editor>);
      editor.setType('ul');
      expect(editor.children).toEqual([
        <ul>
          <li><p>foo</p></li>
          <li><p>bar</p></li>
          <li><p>baz</p></li>
        </ul>
      ]);
    });
  });

  describe('deleteBackward', () => {
    it(`dedents when cursor is at start of element and block is not empty`, () => {
      const editor = makePMEditor2(<editor>
        <h1><cursor />foo</h1>
      </editor>);
      editor.deleteBackward('character');
      expect(editor.children).toEqual([
        <p>foo</p>
      ]);
    });

    it(`deletes backward when block is empty`, () => {
      const editor = makePMEditor2(<editor>
        <p>foo</p>
        <p><cursor /></p>
      </editor>);
      editor.deleteBackward('character');
      expect(editor.children).toEqual([
        <p>foo</p>
      ]);
    });
  });

  describe('indent', () => {
    it('nests list item', () => {
      const editor = makePMEditor2(<editor>
        <ul>
          <li><p>foo</p></li>
          <li><p><cursor />bar</p></li>
          <li><p>baz</p></li>
        </ul>
      </editor>);
      editor.indent();
      expect(editor.children).toEqual([
        <ul>
          <li>
            <p>foo</p>
            <ul>
              <li><p>bar</p></li>
            </ul>
          </li>
          <li><p>baz</p></li>
        </ul>
      ]);
    });
  });

  describe('dedent', () => {
    describe('nested list item', () => {
      it('unnests single item', () => {
        const editor = makePMEditor2(<editor>
          <ul>
            <li>
              <p>foo</p>
              <ul>
                <li><p><cursor />bar</p></li>
              </ul>
            </li>
            <li><p>baz</p></li>
          </ul>
        </editor>);
        editor.dedent();
        expect(editor.children).toEqual([
          <ul>
            <li><p>foo</p></li>
            <li><p>bar</p></li>
            <li><p>baz</p></li>
          </ul>
        ]);
      });

      it('unnests item with following siblings', () => {
        const editor = makePMEditor2(<editor>
          <ul>
            <li>
              <p>foo</p>
              <ul>
                <li><p><cursor />bar</p></li>
                <li><p>baz</p></li>
              </ul>
            </li>
          </ul>
        </editor>);
        editor.dedent();
        expect(editor.children).toEqual([
          <ul>
            <li><p>foo</p></li>
            <li>
              <p>bar</p>
              <ul>
                <li><p>baz</p></li>
              </ul>
            </li>
          </ul>
        ]);
      });

      it('unnests item without following siblings', () => {
        const editor = makePMEditor2(<editor>
          <ul>
            <li>
              <p>foo</p>
              <ul>
                <li><p>bar</p></li>
                <li><p><cursor />baz</p></li>
              </ul>
            </li>
          </ul>
        </editor>);
        editor.dedent();
        expect(editor.children).toEqual([
          <ul>
            <li>
              <p>foo</p>
              <ul>
                <li><p>bar</p></li>
              </ul>
            </li>
            <li><p>baz</p></li>
          </ul>
        ]);
      });
    });

    describe('top-level list item', () => {
      it('unwraps item', () => {
        const editor = makePMEditor2(<editor>
          <ul>
            <li><p>foo</p></li>
            <li><p><cursor />bar</p></li>
            <li><p>baz</p></li>
          </ul>
        </editor>);
        editor.dedent();
        expect(editor.children).toEqual([
          <ul>
            <li><p>foo</p></li>
          </ul>,
          <p>bar</p>,
          <ul>
            <li><p>baz</p></li>
          </ul>,
        ]);
      });
    });
  });

  describe('insertBreak', () => {
    describe('in list item', () => {
      it('splits item', () => {
        const editor = makePMEditor2(<editor>
          <ul>
            <li><p>foo<cursor/>bar</p></li>
          </ul>
        </editor>);
        editor.insertBreak();
        expect(editor.children).toEqual([
          <ul>
            <li><p>foo</p></li>
            <li><p>bar</p></li>
          </ul>
        ]);
      });

      it('dedents when item is empty', () => {
        const editor = makePMEditor2(<editor>
          <ul>
            <li><p><cursor /></p></li>
          </ul>
        </editor>);
        editor.insertBreak();
        expect(editor.children).toEqual([
          // explicit stext is necessary because slate-hyperscript
          // doesn't apply normalization
          <p><stext></stext></p>
        ]);
      });
    });
  });
});
