import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as data from '../../data';

export default function metaForFile(
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
): Signal<data.Meta> {
  const pathParsed = Path.parse(file.path);
  const metaParsed = { ...Path.parse(file.path), base: pathParsed.name + '.meta' };
  const metaPath = Path.format(metaParsed);

  return compiledFiles.flatMap(compiledFiles => {
    const compiled = compiledFiles.get(metaPath);
    if (compiled) {
      return compiled.flatMap(compiled => compiled.exportValue.default);
    } else {
      return Signal.ok({ });
    }
  });
}
