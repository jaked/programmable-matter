import isHotkey from 'is-hotkey';
import { Editor } from 'slate';
import * as PMAST from '../../pmast';
import * as PMEditor from '../../editor/PMEditor';

const MARK_HOTKEYS: { [k: string]: PMAST.mark } = {
  'mod+b':     'bold',
  'mod+i':     'italic',
  'mod+u':     'underline',
  'mod+e':     'code',
  'mod+opt+x': 'strikethrough',

  // TODO(jaked) these don't work
  'mod+opt+shift+_': 'subscript',
  'mod+opt+shift+^': 'superscript',
}

const TYPE_HOTKEYS ={
  'mod+opt+0': 'p',
  'mod+opt+1': 'h1',
  'mod+opt+2': 'h2',
  'mod+opt+3': 'h3',
  'mod+opt+4': 'h4',
  'mod+opt+5': 'h5',
  'mod+opt+6': 'h6',
  'mod+opt+7': 'ul',
  'mod+opt+8': 'ol',
}

export default (editor: Editor) =>
  (re: React.KeyboardEvent) => {
    const e = re as unknown as KeyboardEvent;
    if (isHotkey('tab', e)) {
      e.preventDefault();
      PMEditor.indent(editor);
    }
    if (isHotkey('shift+tab', e)) {
      e.preventDefault();
      PMEditor.dedent(editor);
    }
    if (isHotkey('shift+enter', e)) {
      e.preventDefault();
      PMEditor.softBreak(editor);
    }
    if (isHotkey('mod+enter', e)) {
      e.preventDefault();
      PMEditor.exitBreak(editor);
    }
    for (const hotkey in MARK_HOTKEYS) {
      if (isHotkey(hotkey, e)) {
        e.preventDefault();
        const mark = MARK_HOTKEYS[hotkey];
        PMEditor.toggleMark(editor, mark);
      }
    }
    for (const hotkey in TYPE_HOTKEYS) {
      if (isHotkey(hotkey, e)) {
        e.preventDefault();
        const type = TYPE_HOTKEYS[hotkey];
        PMEditor.setType(editor, type);
      }
    }
  }
