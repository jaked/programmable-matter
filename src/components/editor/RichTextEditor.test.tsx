import React from 'react';
import * as Slate from 'slate';
import * as SlateReact from 'slate-react';
import { parseHotkey } from 'is-hotkey';

import * as PMAST from '../../PMAST';
import * as PMEditor from './PMEditor';
import * as RichTextEditor from './RichTextEditor';

function makeKeyboardEvent(hotkey: string) {
  return {
    preventDefault: () => {},
    ...parseHotkey(hotkey)
  } as React.KeyboardEvent;
}

describe('RichTextEditor', () => {
  describe('onKeyDown', () => {
    function expectMarkOnHotkey(hotkey: string, mark: PMAST.mark) {
      const editor = PMEditor.withPMEditor(Slate.createEditor());
      // TODO(jaked) not sure why `spyOn` type doesn't check
      const toggleMark = jest.spyOn(editor as any, 'toggleMark');
      const onKeyDown = RichTextEditor.makeOnKeyDown(editor);
      const ev = makeKeyboardEvent(hotkey);
      onKeyDown(ev);
      expect(toggleMark).toHaveBeenCalledWith(mark);
    }

    it('toggles marks on hotkeys', () => {
      expectMarkOnHotkey('mod+b', 'bold');
      expectMarkOnHotkey('mod+i', 'italic');
      expectMarkOnHotkey('mod+u', 'underline');
      expectMarkOnHotkey('mod+`', 'code');
    });
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
