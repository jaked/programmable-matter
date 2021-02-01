import * as Path from 'path';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import Type from '../Type';
import * as data from '../../data';

function extractMeta(metaFile: data.CompiledFile): Signal<data.Meta> {
  return metaFile.exportValue.flatMap(exportValue =>
    exportValue.get('default') ?? bug(`expected default`)
  ).liftToTry().map(metaTry =>
    metaTry.type === 'ok' ? metaTry.ok as data.Meta : {}
  );
}

const emptyMeta: data.CompiledFile = {
  exportType: Signal.ok(Type.module({ })),
  exportValue: Signal.ok(new Map([[ 'default', Signal.ok({}) ]])),
  rendered: Signal.ok(null),
  problems: Signal.ok(false),
  ast: Signal.ok(null),
}

export default function metaForPath(
  path: string,
  compiledFiles: Signal<Map<string, data.CompiledFile>>,
): Signal<data.Meta> {
  const pathParsed = Path.parse(path);
  const indexMetaPath = Path.format({ ...pathParsed, base: undefined, name: 'index', ext: '.meta' });
  const metaPath = Path.format({ ...pathParsed, base: undefined, ext: '.meta' });

  return compiledFiles.flatMap(compiledFiles => {
    const indexMeta = extractMeta(compiledFiles.get(indexMetaPath) ?? emptyMeta);
    const meta = extractMeta(compiledFiles.get(metaPath) ?? emptyMeta);
    return Signal.join(indexMeta, meta)
      .map(([indexMeta, meta]) => ({
        title: meta.title ?? indexMeta.dirMeta?.title ?? Name.basename(Name.nameOfPath(path)),
        tags: meta.tags ?? indexMeta.dirMeta?.tags,
        layout: meta.layout ?? indexMeta.dirMeta?.layout,
        publish: meta.publish ?? indexMeta.dirMeta?.publish,
        dataType: meta.dataType ?? indexMeta.dirMeta?.dataType,
      }));
  });
}
