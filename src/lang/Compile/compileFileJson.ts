import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as Parse from '../Parse';
import Type from '../Type';
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

  return ast.liftToTry().flatMap(astTry => {
    const astTryOrig = astTry;
    switch (astTry.type) {
      case 'ok':
        return meta.map(meta => {
          const compiled = compileJson(file, astTry.ok, meta, updateFile);
          return { ...compiled, ast: astTryOrig };
        });

      case 'err':
        return Signal.ok({
          exportType: Type.module({}),
          exportValue: {},
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTryOrig
        });
    }
  });
}
