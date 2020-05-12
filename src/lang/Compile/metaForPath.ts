import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import Type from '../Type';
import * as data from '../../data';

function extractMeta(meta: Signal<data.CompiledFile>): Signal<data.Meta> {
  return meta.flatMap(meta =>
    meta.exportValue.default.liftToTry().map(metaTry => {
      switch (metaTry.type) {
        case 'ok':
          return metaTry.ok;
        case 'err':
          return {};
      }
    })
  );
}

const emptyMeta: Signal<data.CompiledFile> = Signal.ok({
  exportType: Type.module({ }),
  exportValue: { default: Signal.ok(new data.Meta({})) },
  rendered: Signal.ok(null),
  problems: false,
  ast: Try.ok(null),
})

export default function metaForPath(
  path: string,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
): Signal<data.Meta> {
  const pathParsed = Path.parse(path);
  const indexMetaPath = Path.format({ ...pathParsed, base: 'index.meta' });
  const metaPath = Path.format({ ...pathParsed, base: pathParsed.name + '.meta' });

  return compiledFiles.flatMap(compiledFiles => {
    const indexMeta = extractMeta(compiledFiles.get(indexMetaPath) ?? emptyMeta);
    const meta = extractMeta(compiledFiles.get(metaPath) ?? emptyMeta);
    return Signal.join(indexMeta, meta)
      // TODO(jaked) spread interpolation doesn't work on Records, can this be fixed?
      .map(([indexMeta, meta]) => new data.Meta({
        title: indexMeta.dirMeta?.title ?? meta.title,
        tags: indexMeta.dirMeta?.tags ?? meta.tags,
        layout: indexMeta.dirMeta?.layout ?? meta.layout,
        publish: indexMeta.dirMeta?.publish ?? meta.publish,
        dataType: indexMeta.dirMeta?.dataType ?? meta.dataType,
      }));
  });
}
