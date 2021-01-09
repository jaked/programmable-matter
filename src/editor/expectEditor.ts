import { Editor } from 'slate';
import { isInline } from '../editor/isInline';
import { normalizeNode } from '../editor/normalizeNode';

export function expectEditor(e1: JSX.Element, action: (e: Editor) => void, e2: JSX.Element) {
  const ed1 = e1 as unknown as Editor;
  const ed2 = e2 as unknown as Editor;
  ed1.normalizeNode = normalizeNode(ed1);
  ed1.isInline = isInline(ed1);
  Editor.normalize(ed1, { force: true });
  ed2.normalizeNode = normalizeNode(ed2);
  ed2.isInline = isInline(ed2);
  Editor.normalize(ed2, { force: true });
  action(ed1);
  expect(ed1.children).toStrictEqual(ed2.children);
  expect(ed1.selection).toStrictEqual(ed2.selection);
}
