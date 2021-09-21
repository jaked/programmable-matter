import isHotkey from 'is-hotkey';
import { Editor, Range, Transforms } from 'slate';
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

type Props = {
  target: Range | undefined;
  setTarget: (target: Range | undefined) => void;
  index: number;
  setIndex: (index: number) => void;
  completions: string[];
}

export default (editor: Editor, props: Props) => {
  // TODO(jaked)
  // make this part of the Completions component somehow
  if (props.target) {
    const { target, setTarget, index, setIndex, completions } = props;
    return (re: React.KeyboardEvent) => {
      const e = re as unknown as KeyboardEvent;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const prevIndex = index >= completions.length - 1 ? 0 : index + 1;
          setIndex(prevIndex);
          break;
        case 'ArrowUp':
          e.preventDefault();
          const nextIndex = index <= 0 ? completions.length - 1 : index - 1;
          setIndex(nextIndex);
          break;
        case 'Tab':
        case 'Enter':
          e.preventDefault();
          const name = completions[index];
          Transforms.select(editor, target);
          Transforms.insertNodes(editor, {
            type: 'a',
            href: name,
            children: [ { text: name } ]
          });
          setTarget(undefined);
          break;
        case 'Escape':
          e.preventDefault();
          setTarget(undefined);
          break;
      }
    }

  } else {
    return (re: React.KeyboardEvent) => {
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
  }
}
