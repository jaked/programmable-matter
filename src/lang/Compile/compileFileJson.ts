import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as Parse from '../Parse';
import * as data from '../../data';

import compileJson from './compileJson';

export default function compileFileJson(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, any>>,
) {
  const ast = file.content.map(Parse.parseExpression);
  // TODO(jaked) support typechecking from .meta file
  // TODO(jaked) support typechecking from index.table file

  // TODO(jaked) handle updateFile
  return ast.map(ast => {
    const compiled = compileJson(file, ast, {}, (path: string, buffer: Buffer) => {});
    return { ...compiled, ast }
  });
}
