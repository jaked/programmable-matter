import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileMdx from './compileFileMdx';

export default function compileFile(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, any>>,
  compiledNotes: Signal<data.CompiledNotes>,
): Signal<any> {

  switch (file.type) {
    case 'mdx': return compileFileMdx(trace, file, compiledFiles, compiledNotes);

    default: bug('unimplemented');
  }
}
