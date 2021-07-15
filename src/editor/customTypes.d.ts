import { BaseEditor } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'

import * as PMAST from '../model/PMAST';

export type Editor = BaseEditor & ReactEditor & HistoryEditor

declare module 'slate' {
  export interface CustomTypes {
    Editor: Editor
    Element: PMAST.Element
    Text: PMAST.Text
  }
}
