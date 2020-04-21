import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as Parse from '../Parse';
import * as data from '../../data';

import compileJson from './compileJson';

export default function compileFileJson(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<any>>>,
) {
  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support typechecking from index.table file

  // TODO(jaked) extract helper
  const pathParsed = Path.parse(file.path);
  const metaParsed = { ...Path.parse(file.path), base: pathParsed.name + '.meta' };
  const metaPath = Path.format(metaParsed);

  const meta: Signal<data.Meta> = compiledFiles.flatMap(compiledFiles => {
    const compiled = compiledFiles.get(metaPath);
    if (compiled) {
      return compiled.flatMap(compiled => compiled.exportValue.default);
    } else {
      return Signal.ok({ });
    }
  });
  return Signal.join(ast, meta).map(([ast, meta]) => {
    // TODO(jaked) handle updateFile
    const compiled = compileJson(file, ast, meta, (path: string, buffer: Buffer) => {});
    return { ...compiled, ast };
  })
}
