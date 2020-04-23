import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as data from '../../data';

export default function metaForFile(
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
): Signal<data.Meta> {
  const pathParsed = Path.parse(file.path);
  const indexMetaPath = Path.format({ ...pathParsed, base: 'index.meta' });
  const metaPath = Path.format({ ...pathParsed, base: pathParsed.name + '.meta' });

  return compiledFiles.flatMap(compiledFiles => {
    const indexMeta = compiledFiles.get(indexMetaPath);
    const meta = compiledFiles.get(metaPath);
    if (indexMeta && meta) {
      return Signal.join(indexMeta, meta).flatMap(([indexMeta, meta]) =>
        Signal.join(indexMeta.exportValue.default, meta.exportValue.default).map(([indexMeta, meta]) => ({
          ...indexMeta.dirMeta, ...meta
        }))
      );
    } else if (indexMeta) {
      return indexMeta.flatMap(indexMeta =>
        indexMeta.exportValue.default.map(meta => meta.dirMeta)
      );
    } else if (meta) {
      return meta.flatMap(meta => meta.exportValue.default);
    } else {
      return Signal.ok({ });
    }
  });
}
