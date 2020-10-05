import React from 'react';
import * as Slate from 'slate';
import { parseHotkey } from 'is-hotkey';
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
    it('toggles bold on mod+b', () => {
      const editor = PMEditor.withPMEditor(Slate.createEditor());
      // TODO(jaked) not sure why `spyOn` type doesn't check
      const toggleBold = jest.spyOn(editor as any, 'toggleBold');
      const onKeyDown = RichTextEditor.makeOnKeyDown(editor);
      const modB = makeKeyboardEvent('mod+b');
      onKeyDown(modB);
      expect(toggleBold).toHaveBeenCalled();
    });
  });
});
