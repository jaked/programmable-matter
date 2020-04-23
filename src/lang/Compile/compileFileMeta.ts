import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as Parse from '../Parse';
import Type from '../Type';
import * as data from '../../data';

import compileMeta from './compileMeta';

export default function compileFileMeta(
  trace: Trace,
  file: data.File,
): Signal<data.CompiledFile> {
  const ast = file.content.map(Parse.parseExpression);

  return ast.liftToTry().map(astTry => {
    switch (astTry.type) {
      case 'ok': {
        const compiled = compileMeta(astTry.ok);
        return { ...compiled, ast: astTry };
      }
      case 'err': {
        return {
          exportType: Type.module({}),
          exportValue: {},
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTry
        }
      }
    }
  });
}
