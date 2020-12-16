import { Editor, Range, Path } from 'slate';

export const matchStringBefore = (
  editor: Editor,
  at: Range,
  match: (s: string) => boolean,
  samePath: boolean = false, // if true, stop when path changes
): undefined | { match: string, at: Range } => {
  const end = Editor.end(editor, at);
  for (let pos of Editor.positions(editor, { at, reverse: true })) {
    if (samePath && !Path.equals(pos.path, end.path))
      return undefined
    const range = { anchor: pos, focus: end };
    const string = Editor.string(editor, range);
    if (match(string)) {
      return { match: string, at: range };
    }
  }
}
