/** @jsx jsx */
import { Editor } from 'slate';
import { jsx } from '../util/slate-hyperscript-jsx';
import { cursorAtBlockEnd } from './cursorAtBlockEnd';

it('returns true when cursor at block end', () => {
  const editor = <editor>
    <h1>foo<cursor/></h1>
  </editor> as unknown as Editor;
  expect(cursorAtBlockEnd(editor)).toBe(true);
});

it('returns false when cursor not at block end', () => {
  const editor = <editor>
    <h1>foo<cursor/>bar</h1>
  </editor> as unknown as Editor;
  expect(cursorAtBlockEnd(editor)).toBe(false);
});

it('returns false when selection not collapsed', () => {
  const editor = <editor>
    <h1>foo<anchor/>bar<focus/></h1>
  </editor> as unknown as Editor;
  expect(cursorAtBlockEnd(editor)).toBe(false);
});
