import * as Slate from 'slate'
import * as PMAST from '../../PMAST';
import { bug } from '../../util/bug';

export type PMEditor = Slate.Editor & {
  toggleMark(mark: PMAST.mark): void;
  setType(type: PMAST.type): void;
  indent(): void;
  dedent(): void;
}

const inListItem = (editor: Slate.Editor, options: { at?: Slate.Path } = {}): undefined | {
  itemNode: Slate.Element,
  itemPath: Slate.Path,
  listNode: Slate.Element,
  listPath: Slate.Path,
} => {
  const at =
    options.at ?
      Slate.Editor.node(editor, options.at) :
      Slate.Editor.above(editor);
  if (at) {
    const [node, path] = at;
    const item = Slate.Editor.parent(editor, path);
    if (item) {
      const [itemNode, itemPath] = item
      if (itemNode.type === 'li') {
        const list = Slate.Editor.parent(editor, itemPath);
        const [listNode, listPath] = list;
        return { itemNode, itemPath, listNode, listPath };
      }
    }
  }
}

const atStartOfBlock = (editor: Slate.Editor) => {
  const above = Slate.Editor.above(editor);
  if (!editor.selection || Slate.Range.isExpanded(editor.selection) || !above)
    return false;
  const [, path] = above;
  const start = Slate.Editor.start(editor, path);
  if (Slate.Point.equals(editor.selection.anchor, start))
    return true;
  return false;
}

const blockIsEmpty = (editor: Slate.Editor) => {
  const above = Slate.Editor.above(editor);
  if (above) {
    const [node, path] = above;
    if (node.children.length === 1 && node.children[0].text === '')
      return true;
  }
  return false;
}

export const toggleMark = (editor: Slate.Editor, mark: PMAST.mark) => {
  if (!editor.selection) return;

  if (Slate.Range.isExpanded(editor.selection)) {
    const marked = [...Slate.Editor.nodes(
      editor,
      { match: Slate.Text.isText }
    )].every(([node, _path]) => mark in node);
    if (marked) {
      Slate.Transforms.unsetNodes(
        editor,
        mark,
        { match: Slate.Text.isText, split: true },
      );
    } else {
      Slate.Transforms.setNodes(
        editor,
        { [mark]: true },
        { match: Slate.Text.isText, split: true },
      )
    }

  } else {
    // TODO(jaked)
    // Editor.marks computes marks from the nearest text
    // is editor.marks already kept in sync with that?
    const marks = Slate.Editor.marks(editor) || {};
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

export const setType = (editor: Slate.Editor, type: PMAST.type) => {
  const inListItemResult = inListItem(editor);
  if (inListItemResult) {
    const { itemPath, listNode, listPath } = inListItemResult;
    if (type === 'ul' || type === 'ol') {
      if (listNode.type !== type) {
        Slate.Transforms.wrapNodes(
          editor,
          { type, children: [] },
          { at: itemPath }
        );
        Slate.Transforms.liftNodes(editor, { at: itemPath });
      }
    } else {
      if (!inListItem(editor, { at: listPath })) {
        Slate.Transforms.unwrapNodes(editor, { at: itemPath });
        Slate.Transforms.liftNodes(editor, { at: itemPath });
        Slate.Transforms.setNodes(editor, { type });
      }
    }
  } else {
    if (type === 'ol' || type === 'ul') {
      Slate.Transforms.setNodes(editor, { type: 'p' });
      Slate.Transforms.wrapNodes(editor, { type, children: [] });
      // TODO(jaked) wrap individual paragraphs
      Slate.Transforms.wrapNodes(editor, { type: 'li', children: [] });
    } else {
      Slate.Transforms.setNodes(editor, { type });
    }
  }
}

export const indent = (editor: Slate.Editor) => {
  if (!editor.selection) return;

  if (Slate.Range.isExpanded(editor.selection)) {

  } else {
    const inListItemResult = inListItem(editor);
    if (inListItemResult) {
      const { itemNode, itemPath, listNode, listPath } = inListItemResult;
      if (itemPath[itemPath.length - 1] > 0) {
        Slate.Transforms.wrapNodes(
          editor,
          { type: listNode.type, children: [] },
          { at: itemPath }
        );
        Slate.Transforms.wrapNodes(
          editor,
          { type: itemNode.type, children: [] },
          { at: itemPath }
        );
        Slate.Transforms.mergeNodes(editor, { at: itemPath });
      }
    }
  }
}

export const dedent = (editor: Slate.Editor) => {
  Slate.Editor.withoutNormalizing(editor, () => {
    if (!editor.selection) return;

    if (Slate.Range.isExpanded(editor.selection)) {

    } else {
      const inListItemResult = inListItem(editor);
      if (inListItemResult) {
        const { itemNode, itemPath, listNode, listPath } = inListItemResult;
        if (inListItem(editor, { at: listPath })) {
          const itemPos = itemPath[itemPath.length - 1];
          // if there are items in the list below the one we're dedenting...
          if (itemPos < listNode.children.length - 1) {
            // split them into a new list...
            const nextRef = Slate.Editor.pathRef(editor, Slate.Path.next(itemPath));
            Slate.Transforms.splitNodes(editor, { at: nextRef.current! });
            // move the new list under the item we're dedenting
            const newListPath = Slate.Path.parent(nextRef.current!);
            // TODO(jaked) what if itemNode contains a list of a different type?
            const nestedListPath = itemPath.concat(itemNode.children.length);
            Slate.Transforms.moveNodes(editor, { at: newListPath, to: nestedListPath });
            nextRef.unref();
          }
          const itemRef = Slate.Editor.pathRef(editor, itemPath);
          Slate.Transforms.liftNodes(editor, { at: itemRef.current! });
          Slate.Transforms.liftNodes(editor, { at: itemRef.current! });
          itemRef.unref();
        } else {
          Slate.Transforms.unwrapNodes(editor, { at: itemPath });
          Slate.Transforms.liftNodes(editor, { at: itemPath });
        }
      } else {
        Slate.Transforms.setNodes(editor, { type: 'p' });
      }
    }
  });
}

export const withPMEditor = (editor: Slate.Editor) => {
  editor.toggleMark = (mark: PMAST.mark) => {
    toggleMark(editor, mark);
  }
  editor.setType = (type: PMAST.type) => {
    setType(editor, type);
  }

  const { normalizeNode } = editor;
  editor.normalizeNode = ([node, path]: [Slate.Node, Slate.Path]) => {
    if (!Slate.Text.isText(node)) {
      let prevType: PMAST.type | undefined = undefined;
      for (const [child, childPath] of Slate.Node.children(editor, path)) {
        if (child.type === prevType && (prevType === 'ol' || prevType === 'ul')) {
          Slate.Transforms.mergeNodes(editor, {
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
        const above = Slate.Editor.above(editor);
        if (above) {
          const [, path] = above;
          Slate.Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path });
          Slate.Transforms.liftNodes(editor, { at: path });
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
