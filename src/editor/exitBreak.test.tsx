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
      <code>foo</code>
      <p><cursor/></p>
      <code>bar</code>
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
      </blockquote>
      <p><cursor/></p>
      <blockquote>
        <p>bar</p>
      </blockquote>
    </editor>,
  );
})

it('breaks out of list', () => {
  expectEditor(
    <editor>
      <ul>
        <li><p>foo<cursor/></p></li>
        <li><p>bar</p></li>
      </ul>
    </editor>,

    editor => exitBreak(editor),

    <editor>
      <ul>
        <li><p>foo</p></li>
      </ul>
      <p><cursor/></p>
      <ul>
        <li><p>bar</p></li>
      </ul>
    </editor>,
  );
})
