/** @jsx jsx */
import { jsx } from '../util/slate-hyperscript-jsx';
import { expectEditor } from './expectEditor';
import { exitBreak } from './exitBreak';

it('breaks out of code block', () => {
  expectEditor(
    <editor>
      <code>foo<cursor/>bar</code>
    </editor>,

    editor => exitBreak(editor),

    <editor>
      <code>foobar</code>,
      <p><cursor/></p>
    </editor>,
  );
});

it('breaks out of blockquote', () => {
  expectEditor(
    <editor>
      <blockquote>
        <p>foo<cursor/></p>
        <p>bar</p>
      </blockquote>
    </editor>,

    editor => exitBreak(editor),

    <editor>
      <blockquote>
        <p>foo</p>
        <p>bar</p>
      </blockquote>,
      <p><cursor/></p>
    </editor>,
  );
})
