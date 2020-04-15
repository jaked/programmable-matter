import * as Path from 'path';
import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import { diffMap } from '../../util/immutable/Map';
import * as data from '../../data';

// TODO(jaked) method on File?
function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir;
  else return Path.join(pathParts.dir, pathParts.name);
}

function groupFilesByTag(
  files: data.Files,
  oldFiles: data.Files,
  oldGroupedFiles: Immutable.Map<string, Immutable.Map<string, data.File>>,
): Immutable.Map<string, Immutable.Map<string, data.File>> {

  let groupedFiles = oldGroupedFiles;
  let { added, changed, deleted } = diffMap(oldFiles, files);

  deleted.forEach(path => {
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.delete(path));
  });

  changed.forEach(([prev, curr], path) => {
    // TODO(jaked) can this ever happen for Filesystem?
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.set(path, curr));
  });

  added.forEach((file, path) => {
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || Immutable.Map<string, data.File>();
    groupedFiles = groupedFiles.set(tag, group.set(path, file));
  })

  return groupedFiles;
}

export default function groupFilesByTag2(
  files: Signal<data.Files>
): Signal<Immutable.Map<string, Immutable.Map<string, data.File>>> {
  const tags = Signal.mapWithPrev(
    files,
    groupFilesByTag,
    Immutable.Map(),
    Immutable.Map()
  )

  // TODO(jaked) add directory indexes

  return tags;
}
