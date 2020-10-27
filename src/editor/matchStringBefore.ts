import { Editor, Range } from 'slate';

export const matchStringBefore = (editor: Editor, at: Range, match: (s: string) => boolean): undefined | {
  match: string,
  at: Range,
} => {
  const end = Editor.end(editor, at);
  for (let pos of Editor.positions(editor, { at, reverse: true })) {
    const range = { anchor: pos, focus: end };
    const string = Editor.string(editor, range);
    if (match(string)) {
      return {
        match: string,
        at: range,
      };
    }
  }
}
