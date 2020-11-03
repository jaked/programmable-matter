import React from 'react';
import * as Slate from 'slate';
import * as SlateReact from 'slate-react';
import { parseHotkey } from 'is-hotkey';

import * as PMEditor from '../../editor/PMEditor';
import * as RichTextEditor from './RichTextEditor';

function makeKeyboardEvent(hotkey: string) {
  return {
    preventDefault: () => {},
    ...parseHotkey(hotkey)
  } as React.KeyboardEvent;
}

describe('RichTextEditor', () => {
  describe('onKeyDown', () => {
    // TODO(jaked)
    // figure out how to test
    // use Jest mocking, or pass an explicit PMEditor mock to RichTextEditor
  });

  describe('renderLeaf', () => {
    it('renders marks', () => {
      const text = { text: 'foo', bold: true, underline: true };
      const rendered = RichTextEditor.renderLeaf({
        leaf: text,
        attributes: {},
        children: text.text,
      } as unknown as SlateReact.RenderLeafProps);
      expect(rendered).toEqual(<span>
        <u><strong>foo</strong></u>
      </span>)
    });
  });
});
