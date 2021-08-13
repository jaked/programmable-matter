import * as Url from 'url';
import { Editor, Range, Text, Transforms } from 'slate';
import { bug } from '../util/bug';
import * as PMAST from '../pmast';
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

  '>': 'blockquote',

  // TODO(jaked) this would be more usable if it fired on enter not space
  '{{{': 'liveCode',
  '```': 'code',
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
  const [link] = Editor.nodes(editor, { match: PMAST.isLink });
  return !!link
}

const wrapLink = (editor: Editor, url: string) => {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection)) {
    const match =
      inLink(editor) ? PMAST.isLink : PMAST.isText;
    Transforms.insertNodes(editor, {
      type: 'a',
      href: url,
      children: [ { text: url } ],
    }, { match });
  } else {
    if (inLink(editor)) {
      const [start, end] = Range.edges(selection);
      const rangeRef = Editor.rangeRef(editor, selection, { affinity: 'inward' })
      // TODO(jaked)
      // docs for unwrapNodes suggest it does this split but it doesn't work
      Transforms.splitNodes(editor, { at: end, match: PMAST.isLink })
      Transforms.splitNodes(editor, { at: start, match: PMAST.isLink })
      Transforms.select(editor, rangeRef.unref()!);
      Transforms.unwrapNodes(editor, { match: PMAST.isLink, split: true });
    }
    Transforms.wrapNodes(
      editor,
      { type: 'a', href: url, children: [] },
      { split: true }
    );
    Transforms.collapse(editor, { edge: 'end' });
  }
}

const handleDelimitedShortcut = (
  editor: Editor,
  at: Range,
  startDelim: string,
  endDelim: string,
  handle: (r: Range, s: string) => void,
): boolean => {
  const matchEnd = matchStringBefore(editor, at, s => s === endDelim);
  if (matchEnd) {
    const startAt = { anchor: at.anchor, focus: matchEnd.at.anchor }
    const matchStart = matchStringBefore(editor, startAt, s => s.startsWith(startDelim));
    if (matchStart) {
      const startAnchorRef = Editor.pointRef(editor, matchStart.at.anchor);
      const startFocus = Editor.after(editor, matchStart.at.anchor, { distance: startDelim.length }) || bug('expected after');
      const startFocusRef = Editor.pointRef(editor, startFocus);
      const endAnchorRef = Editor.pointRef(editor, matchEnd.at.anchor);
      const endFocusRef = Editor.pointRef(editor, matchEnd.at.focus);
      Transforms.delete(editor, { at: { anchor: startAnchorRef.current!, focus: startFocusRef.current! } });
      Transforms.delete(editor, { at: { anchor: endAnchorRef.current!, focus: endFocusRef.current! } });
      const range = { anchor: startFocusRef.current!, focus: endAnchorRef.current! };
      const text = Editor.string(editor, range);
      handle(range, text);
      startAnchorRef.unref();
      startFocusRef.unref();
      endAnchorRef.unref();
      endFocusRef.unref();

      return true;
    }
  }
  return false;
}

export const insertText = (editor: Editor) => {
  const { insertText } = editor;

  // the default Slate insertText
  // but with the business about moving the cursor outside the inline removed
  // TODO(jaked) find out why it's like this
/*
  const insertText = (text: string) => {
    const { selection, marks } = editor

    if (selection) {
      if (marks) {
        const node = { text, ...marks }
        Transforms.insertNodes(editor, node)
      } else {
        Transforms.insertText(editor, text)
      }

      editor.marks = null
    }
  }
  */

  return (text: string) => {
    const above = Editor.above(editor);
    if (!above) return insertText(text);

    const [node, path] = above;
    if (PMAST.isLiveCode(node) || PMAST.isInlineLiveCode(node))
      return insertText(text);

    if (isUrl(text)) return wrapLink(editor, text);

    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection))
      return insertText(text);

    const start = Editor.start(editor, path);
    const range = { anchor: start, focus: selection.anchor };

    if (text === ' ') {
      const beforeText = Editor.string(editor, range);
      const type = SHORTCUTS[beforeText];

      if (type) {
        Transforms.delete(editor, { at: range });
        return setType(editor, type);
      }

      // TODO(jaked)
      // might be nice to handle these without requiring a trailing space
      // but it creates an ambiguity between e.g. * and **
      for (const [delim, mark] of [
        ['**', 'bold'],
        ['*', 'italic'],
        ['~~', 'strikethrough'],
        ['^', 'superscript'],
        ['_', 'subscript'],
        ['`', 'code'],
      ]) {
        if (handleDelimitedShortcut(editor, range, delim, delim, range => {
          // TODO(jaked) setMark?
          Transforms.setNodes(
            editor,
            { [mark]: true },
            {
              at: range,
              match: Text.isText,
              split: true
            },
          );
        })) {
          Editor.removeMark(editor, mark); // else mark is copied to space
          return insertText(text);
        }
      }

      if (handleDelimitedShortcut(editor, range, '{', '}', range => {
        Transforms.wrapNodes(
          editor,
          { type: 'inlineLiveCode', children: [] },
          {
            at: range,
            match: Text.isText,
            split: true
          }
        );
      })) {
        return insertText(text);
      }

      if (handleDelimitedShortcut(editor, range, '[[', ']]', (range, text) => {
        Transforms.wrapNodes(
          editor,
          { type: 'a', href: text, children: [] },
          {
            at: range,
            match: Text.isText,
            split: true
          }
        );
      })) {
        return insertText(text);
      }

      if (!PMAST.isLink(node)) {
        const matchUrl = matchStringBefore(editor, range, isUrl, true);
        if (matchUrl) {
          const { match: url, at } = matchUrl;
          Transforms.wrapNodes(
            editor,
            { type: 'a', href: url, children: [] },
            { at, split: true }
          );
        }
      }

      return insertText(text);
    }

    insertText(text);
  }
}