import { Editor, Element, Node, Path, Point, Range, Text, Transforms } from 'slate';
import * as PMAST from '../PMAST';
import { bug } from '../util/bug';

export type PMEditor = Editor & {
  toggleMark(mark: PMAST.mark): void;
  setType(type: PMAST.type): void;
  indent(): void;
  dedent(): void;
}

const inListItem = (editor: Editor, options: { at?: Path } = {}): undefined | {
  itemNode: Element,
  itemPath: Path,
  listNode: Element,
  listPath: Path,
} => {
  const at =
    options.at ?
      Editor.node(editor, options.at) :
      Editor.above(editor);
  if (at) {
    const [node, path] = at;
    const item = Editor.parent(editor, path);
    if (item) {
      const [itemNode, itemPath] = item
      if (itemNode.type === 'li') {
        const list = Editor.parent(editor, itemPath);
        const [listNode, listPath] = list;
        return { itemNode, itemPath, listNode, listPath };
      }
    }
  }
}

const atStartOfBlock = (editor: Editor) => {
  const above = Editor.above(editor);
  if (!editor.selection || Range.isExpanded(editor.selection) || !above)
    return false;
  const [, path] = above;
  const start = Editor.start(editor, path);
  if (Point.equals(editor.selection.anchor, start))
    return true;
  return false;
}

const blockIsEmpty = (editor: Editor) => {
  const above = Editor.above(editor);
  if (above) {
    const [node, path] = above;
    if (node.children.length === 1 && node.children[0].text === '')
      return true;
  }
  return false;
}

export const toggleMark = (editor: Editor, mark: PMAST.mark) => {
  if (!editor.selection) return;

  if (Range.isExpanded(editor.selection)) {
    const marked = [...Editor.nodes(
      editor,
      { match: Text.isText }
    )].every(([node, _path]) => mark in node);
    if (marked) {
      Transforms.unsetNodes(
        editor,
        mark,
        { match: Text.isText, split: true },
      );
    } else {
      Transforms.setNodes(
        editor,
        { [mark]: true },
        { match: Text.isText, split: true },
      )
    }

  } else {
    // TODO(jaked)
    // Editor.marks computes marks from the nearest text
    // is editor.marks already kept in sync with that?
    const marks = Editor.marks(editor) || {};
    if (mark in marks) {
      const newMarks = { ...marks };
      delete newMarks[mark];
      editor.marks = newMarks;
    } else {
      const newMarks = { ...marks, [mark]: true }
      editor.marks = newMarks
    }
    editor.onChange();
  }
}

export const setType = (editor: Editor, type: PMAST.type) => {
  const inListItemResult = inListItem(editor);
  if (inListItemResult) {
    const { itemPath, listNode, listPath } = inListItemResult;
    if (type === 'ul' || type === 'ol') {
      if (listNode.type !== type) {
        Transforms.wrapNodes(
          editor,
          { type, children: [] },
          { at: itemPath }
        );
        Transforms.liftNodes(editor, { at: itemPath });
      }
    } else {
      if (!inListItem(editor, { at: listPath })) {
        Transforms.unwrapNodes(editor, { at: itemPath });
        Transforms.liftNodes(editor, { at: itemPath });
        Transforms.setNodes(editor, { type });
      }
    }
  } else {
    if (type === 'ol' || type === 'ul') {
      Transforms.setNodes(editor, { type: 'p' });
      Transforms.wrapNodes(editor, { type, children: [] });
      // TODO(jaked) wrap individual paragraphs
      Transforms.wrapNodes(editor, { type: 'li', children: [] });
    } else {
      Transforms.setNodes(editor, { type });
    }
  }
}

export const indent = (editor: Editor) => {
  if (!editor.selection) return;

  if (Range.isExpanded(editor.selection)) {

  } else {
    const inListItemResult = inListItem(editor);
    if (inListItemResult) {
      const { itemNode, itemPath, listNode, listPath } = inListItemResult;
      if (itemPath[itemPath.length - 1] > 0) {
        Transforms.wrapNodes(
          editor,
          { type: listNode.type, children: [] },
          { at: itemPath }
        );
        Transforms.wrapNodes(
          editor,
          { type: itemNode.type, children: [] },
          { at: itemPath }
        );
        Transforms.mergeNodes(editor, { at: itemPath });
      }
    }
  }
}

export const dedent = (editor: Editor) => {
  Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;

    if (Range.isExpanded(editor.selection)) {

    } else {
      const inListItemResult = inListItem(editor);
      if (inListItemResult) {
        const { itemNode, itemPath, listNode, listPath } = inListItemResult;
        if (inListItem(editor, { at: listPath })) {
          const itemPos = itemPath[itemPath.length - 1];
          // if there are items in the list below the one we're dedenting...
          if (itemPos < listNode.children.length - 1) {
            // split them into a new list...
            const nextRef = Editor.pathRef(editor, Path.next(itemPath));
            Transforms.splitNodes(editor, { at: nextRef.current! });
            // move the new list under the item we're dedenting
            const newListPath = Path.parent(nextRef.current!);
            // TODO(jaked) what if itemNode contains a list of a different type?
            const nestedListPath = itemPath.concat(itemNode.children.length);
            Transforms.moveNodes(editor, { at: newListPath, to: nestedListPath });
            nextRef.unref();
          }
          const itemRef = Editor.pathRef(editor, itemPath);
          Transforms.liftNodes(editor, { at: itemRef.current! });
          Transforms.liftNodes(editor, { at: itemRef.current! });
          itemRef.unref();
        } else {
          Transforms.unwrapNodes(editor, { at: itemPath });
          Transforms.liftNodes(editor, { at: itemPath });
        }
      } else {
        Transforms.setNodes(editor, { type: 'p' });
      }
    }
  });
}

export const withPMEditor = (editor: Editor) => {
  editor.toggleMark = (mark: PMAST.mark) => {
    toggleMark(editor, mark);
  }
  editor.setType = (type: PMAST.type) => {
    setType(editor, type);
  }

  const { normalizeNode } = editor;
  editor.normalizeNode = ([node, path]: [Node, Path]) => {
    if (!Text.isText(node)) {
      let prevType: PMAST.type | undefined = undefined;
      for (const [child, childPath] of Node.children(editor, path)) {
        if (child.type === prevType && (prevType === 'ol' || prevType === 'ul')) {
          Transforms.mergeNodes(editor, {
            at: childPath,
          });
          return;
        }
        prevType = child.type as PMAST.type;
      }
    }
    normalizeNode([node, path]);
  }

  const { deleteBackward } = editor;
  editor.deleteBackward = (unit: 'character' | 'word' | 'line' | 'block') => {
    if (atStartOfBlock(editor) && !blockIsEmpty(editor)) {
      dedent(editor);
      return;
    }

    deleteBackward(unit);
  }

  const { insertBreak } = editor;
  editor.insertBreak = () => {
    if (inListItem(editor)) {
      if (blockIsEmpty(editor)) {
        dedent(editor);
      } else {
        insertBreak();
        const above = Editor.above(editor);
        if (above) {
          const [, path] = above;
          Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path });
          Transforms.liftNodes(editor, { at: path });
        }
      }
      return;
    }

    insertBreak();
  }

  editor.indent = () => indent(editor);
  editor.dedent = () => dedent(editor);

  return editor as PMEditor;
}
