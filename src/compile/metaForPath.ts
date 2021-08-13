import * as Path from 'path';
import Signal from '../util/Signal';
import * as Name from '../util/Name';
import * as model from '../model';

function extractMeta(metaFile: model.CompiledFile): Signal<model.Meta> {
  return metaFile.exportValue.map(exportValue => {
    const meta = exportValue.get('default');
    return (meta instanceof Error) ? {} : meta as model.Meta
  });
}

const emptyMeta: model.CompiledFile = {
  exportInterface: Signal.ok(new Map()),
  exportValue: Signal.ok(new Map([[ 'default', {} ]])),
  rendered: Signal.ok(null),
  problems: Signal.ok(false),
  ast: Signal.ok(null),
}

export default function metaForPath(
  path: string,
  compiledFiles: Signal<Map<string, model.CompiledFile>>,
): Signal<model.Meta> {
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
