/** @jsx jsx */
import { Editor } from 'slate';
import { bug } from '../util/bug';
import { jsx } from '../util/slate-hyperscript-jsx';
import { matchStringBefore } from './matchStringBefore';

it('matches matching string', () => {
  const editor = <editor>
    <p>
      <anchor />
      bar
      <stext bold={true}>fo</stext>
      o<focus />
    </p>
  </editor> as unknown as Editor;

  const at = editor.selection || bug();
  const match = matchStringBefore(editor, at, s => s === 'foo');
  expect(match).toEqual({
    match: 'foo',
    at: { anchor: { path: [0, 1], offset: 0 }, focus: at.focus },
  });
});

it(`doesn't match across nodes with samePath=true`, () => {
  const editor = <editor>
    <p>
      <anchor />
      bar
      <stext bold={true}>fo</stext>
      o<focus />
    </p>
  </editor> as unknown as Editor;

  const at = editor.selection || bug();
  const match = matchStringBefore(editor, at, s => s === 'foo', true);
  expect(match).toBeUndefined();
});
