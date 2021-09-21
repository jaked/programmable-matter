import { Editor, Range } from 'slate';
import { blockAbove } from '../../editor/blockAbove';

type Props = {
  setTarget: (target: Range | undefined) => void;
  setMatch: (match: string) => void;
  setIndex: (index: number) => void;
}

export default (editor: Editor, props: Props) => () => {
  const { selection } = editor;
  const blockEntry = blockAbove(editor);
  if (selection && Range.isCollapsed(selection) && blockEntry) {
    const [ _, blockPath ] = blockEntry;
    const anchor = Editor.start(editor, blockPath);
    const focus = selection.focus;
    const at = { anchor, focus };
      for (let pos of Editor.positions(editor, { at, reverse: true })) {
      const range = { anchor: pos, focus };
      const string = Editor.string(editor, range);
      const match = string.match(/^\[\[(.*)/);
      if (match) {
        const after = Editor.after(editor, selection.focus);
        const afterRange = Editor.range(editor, selection.focus, after);
        const afterText = Editor.string(editor, afterRange);
        const afterMatch = afterText.match(/^(\s|$)/);
          if (afterMatch) {
          props.setTarget(range);
          props.setMatch(match[1]);
          props.setIndex(0);
          return;
        }
      }
    }
  }
  props.setTarget(undefined);
}