import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import * as Parse from '../Parse';
import * as data from '../../data';

import compileJson from './compileJson';
import metaForFile from './metaForFile';

export default function compileFileJson(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  updateFile: (path: string, buffer: Buffer) => void,
): Signal<data.CompiledFile> {
  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support typechecking from index.table file

  const meta = metaForFile(file, compiledFiles);

  return Signal.join(ast, meta).map(([ast, meta]) => {
    const compiled = compileJson(file, ast, meta, updateFile);
    return { ...compiled, ast: Try.ok(ast) };
  })
}
