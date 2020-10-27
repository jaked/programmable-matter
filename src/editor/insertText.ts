import * as Url from 'url';
import { Editor, Range, Transforms } from 'slate';
import { matchStringBefore } from './matchStringBefore';
import { setType } from './setType';

const SHORTCUTS = {
  '*': 'ul',
  '-': 'ul',
  '+': 'ul',
  '1.': 'ol',
  '#': 'h1',
  '##': 'h2',
  '###': 'h3',
  '####': 'h4',
  '#####': 'h5',
  '######': 'h6',
}

const isUrl = (text: string) => {
  const url = Url.parse(text);
  return !!(
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.slashes &&
    url.hostname
  );
}

const inLink = (editor: Editor) => {
  const [link] = Editor.nodes(editor, { match: n => n.type === 'a' });
  return !!link
}

const wrapLink = (editor: Editor, url: string) => {
  if (inLink(editor)) {
    Transforms.unwrapNodes(editor, { match: n => n.type === 'a' });
  }

  const { selection } = editor;
  if (selection && Range.isCollapsed(selection)) {
    Transforms.insertNodes(editor, {
      type: 'a',
      href: url,
      children: [ { text: url } ],
    });
  } else {
    Transforms.wrapNodes(
      editor,
      { type: 'a', href: url, children: [] },
      { split: true }
    );
    Transforms.collapse(editor, { edge: 'end' });
  }
}

export const insertText = (editor: Editor) => {
  const { insertText } = editor;
  return (text: string) => {
    if (isUrl(text)) {
      wrapLink(editor, text);
      return;
    }

    const { selection } = editor;
    if (text === ' ' && selection && Range.isCollapsed(selection)) {
      const above = Editor.above(editor);
      if (above) {
        const [, path] = above;
        const range = { anchor: Editor.start(editor, path), focus: selection.anchor };
        const beforeText = Editor.string(editor, range);
        const type = SHORTCUTS[beforeText];

        if (type) {
          Transforms.delete(editor, { at: range });
          setType(editor, type);
          return;
        }

        const matchUrl = matchStringBefore(editor, range, isUrl);
        if (matchUrl) {
          const { match: url, at } = matchUrl;
          Transforms.wrapNodes(
            editor,
            { type: 'a', href: url, children: [] },
            { at, split: true }
          );
        }
      }
    }

    insertText(text);
  }
}