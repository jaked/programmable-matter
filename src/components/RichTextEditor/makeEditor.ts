import { createEditor, Range } from 'slate';
import { withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import * as PMEditor from '../../editor/PMEditor';
import makeSetCompletionTarget from './makeSetCompletionTarget';

type Props = {
  setTarget: (target: Range | undefined) => void;
  setMatch: (match: string) => void;
  setIndex: (index: number) => void;
}

export default (props: Props) => {
  const editor = withHistory(withReact(PMEditor.withPMEditor(createEditor())));

  // the default react-slate insertData splits inserted text into lines
  // and wraps the enclosing element around each line.
  // we don't always want that behavior, so override it
  // and pass multiline text directly to insertText.
  const { insertData } = editor;
  editor.insertData = (data: DataTransfer) => {
    if (data.getData('application/x-slate-fragment')) {
      insertData(data);
    } else {
      const text = data.getData('text/plain');
      if (text) {
        editor.insertText(text);
      }
    }
  }

  const setCompletionTarget = makeSetCompletionTarget(editor, props);
  const { insertText } = editor;
  editor.insertText = (text: string) => {
    insertText(text);
    setCompletionTarget();
  }

  return editor;
}