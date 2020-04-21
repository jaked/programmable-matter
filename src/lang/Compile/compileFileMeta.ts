import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import * as Parse from '../Parse';
import * as data from '../../data';

import compileMeta from './compileMeta';

export default function compileFileMeta(
  trace: Trace,
  file: data.File,
): Signal<data.CompiledFile> {
  const ast = file.content.map(Parse.parseExpression);
  return ast.map(ast => {
    const compiled = compileMeta(ast);
    return { ...compiled, ast: Try.ok(ast) }
  });
}
