import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileMeta from './compileFileMeta';
import compileFileMdx from './compileFileMdx';
import compileFileJson from './compileFileJson';
import compileFileTable from './compileFileTable';

export default function compileFile(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  compiledNotes: Signal<data.CompiledNotes>,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (note: string) => void,
): Signal<data.CompiledFile> {

  switch (file.type) {
    case 'meta':
      return compileFileMeta(trace, file);

    case 'mdx':
      return compileFileMdx(trace, file, compiledFiles, compiledNotes, setSelected);

    case 'json':
      return compileFileJson(trace, file, compiledFiles, updateFile);

    case 'table':
      return compileFileTable(trace, file, compiledFiles, setSelected);

    default: bug('unimplemented');
  }
}
