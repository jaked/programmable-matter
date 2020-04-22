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
): Signal<data.CompiledFile> {
  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support typechecking from index.table file

  const meta = metaForFile(file, compiledFiles);

  return Signal.join(ast, meta).map(([ast, meta]) => {
    // TODO(jaked) handle updateFile
    const compiled = compileJson(file, ast, meta, (path: string, buffer: Buffer) => {});
    return { ...compiled, ast: Try.ok(ast) };
  })
}
