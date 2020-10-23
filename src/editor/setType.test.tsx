/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { setType } from './setType';

it('sets header type at cursor', () => {
  const editor = <editor>
    <p><cursor />foo</p>
  </editor> as unknown as Editor;
  setType(editor, 'h1');
  expect(editor.children).toEqual([
    <h1>foo</h1>
  ]);
});

it('sets header type in selection', () => {
  const editor = <editor>
    <p>foo</p>
    <p><anchor />bar</p>
    <p>baz<focus/></p>
  </editor> as unknown as Editor;
  setType(editor, 'h1');
  expect(editor.children).toEqual([
    <p>foo</p>,
    <h1>bar</h1>,
    <h1>baz</h1>,
  ]);
});

it('wraps list type', () => {
  const editor = <editor>
    <p><cursor />foo</p>
  </editor> as unknown as Editor;
  setType(editor, 'ul');
  expect(editor.children).toEqual([
    <ul>
      <li><p>foo</p></li>
    </ul>
  ]);
});

it(`doesn't wrap list type more than once`, () => {
  const editor = <editor>
    <ul>
      <li><p><cursor />foo</p></li>
    </ul>
  </editor> as unknown as Editor;
  setType(editor, 'ol');
  expect(editor.children).toEqual([
    <ol>
      <li><p>foo</p></li>
    </ol>
  ]);
});

it('unwraps list type', () => {
  const editor = <editor>
    <ul>
      <li><p><cursor />foo</p></li>
    </ul>
  </editor> as unknown as Editor;
  setType(editor, 'p');
  expect(editor.children).toEqual([
    <p>foo</p>
  ]);
});

it(`splits and unwraps multi-item list`, () => {
  const editor = <editor>
    <ul>
      <li><p>foo</p></li>
      <li><p><cursor />bar</p></li>
      <li><p>baz</p></li>
    </ul>
  </editor> as unknown as Editor;
  setType(editor, 'p');
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
