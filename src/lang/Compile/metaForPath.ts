import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import Type from '../Type';
import * as data from '../../data';

function extractMeta(meta: Signal<data.CompiledFile>): Signal<data.Meta> {
  return meta.flatMap(meta =>
    meta.exportValue.flatMap(exportValue =>
      exportValue.default
    )
  ).liftToTry().map(metaTry =>
    metaTry.type === 'ok' ? metaTry.ok : {}
  );
}

const emptyMeta: Signal<data.CompiledFile> = Signal.ok({
  exportType: Signal.ok(Type.module({ })),
  exportValue: Signal.ok({ default: Signal.ok(data.Meta({})) }),
  rendered: Signal.ok(null),
  problems: Signal.ok(false),
  ast: Signal.ok(null),
})

export default function metaForPath(
  path: string,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
): Signal<data.Meta> {
  const pathParsed = Path.parse(path);
  const indexMetaPath = Path.format({ ...pathParsed, base: undefined, name: 'index', ext: '.meta' });
  const metaPath = Path.format({ ...pathParsed, base: undefined, ext: '.meta' });

  return compiledFiles.flatMap(compiledFiles => {
    const indexMeta = extractMeta(compiledFiles.get(indexMetaPath) ?? emptyMeta);
    const meta = extractMeta(compiledFiles.get(metaPath) ?? emptyMeta);
    return Signal.join(indexMeta, meta)
      .map(([indexMeta, meta]) => data.Meta({
        title: meta.title ?? indexMeta.dirMeta?.title ?? Name.basename(Name.nameOfPath(path)),
        tags: meta.tags ?? indexMeta.dirMeta?.tags,
        layout: meta.layout ?? indexMeta.dirMeta?.layout,
        publish: meta.publish ?? indexMeta.dirMeta?.publish,
        dataType: meta.dataType ?? indexMeta.dirMeta?.dataType,
      }));
  });
}
