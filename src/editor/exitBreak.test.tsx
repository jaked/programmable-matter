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
        <li><p>bar</p></li>
      </ul>,
      <p><cursor/></p>
    </editor>,
  );
})
