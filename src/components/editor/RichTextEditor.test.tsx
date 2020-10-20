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
    function expectCallOnKey(hotkey: string, methodName: string, ...args: unknown[]) {
      const editor = PMEditor.withPMEditor(Slate.createEditor());
      const method = jest.spyOn(editor as any, methodName);
      const onKeyDown = RichTextEditor.makeOnKeyDown(editor);
      const ev = makeKeyboardEvent(hotkey);
      onKeyDown(ev);
      expect(method).toHaveBeenCalledWith(...args);
    }

    it('toggles marks on hotkeys', () => {
      expectCallOnKey('mod+b', 'toggleMark', 'bold');
      expectCallOnKey('mod+i', 'toggleMark', 'italic');
      expectCallOnKey('mod+u', 'toggleMark', 'underline');
      expectCallOnKey('mod+`', 'toggleMark', 'code');
    });

    it('indents on tab', () => {
      expectCallOnKey('tab', 'indent');
    });

    it('dedents on shift+tab', () => {
      expectCallOnKey('shift+tab', 'dedent');
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
