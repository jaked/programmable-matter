import * as Path from 'path';
import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import { diffMap } from '../../util/immutable/Map';
import * as data from '../../data';

function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir;
  else return Path.join(pathParts.dir, pathParts.name);
}

function groupPathsByTag(
  files: data.Files,
  oldFiles: data.Files,
  oldGroupedPaths: Immutable.Map<string, Immutable.Set<string>>,
): Immutable.Map<string, Immutable.Set<string>> {

  let groupedPaths = oldGroupedPaths;
  let { added, changed, deleted } = diffMap(oldFiles, files);

  deleted.forEach(path => {
    const tag = tagOfPath(path);
    const group = groupedPaths.get(tag) || bug(`expected group for ${tag}`);
    groupedPaths = groupedPaths.set(tag, group.delete(path));
  });

  added.forEach((_, path) => {
    const tag = tagOfPath(path);
    const group = groupedPaths.get(tag) || Immutable.Set<string>();
    groupedPaths = groupedPaths.set(tag, group.add(path));
  })

  return groupedPaths;
}

// TODO(jaked) should return Set; need Set-diffing machinery
export default function noteTagsOfFiles(
  files: Signal<data.Files>
): Signal<Immutable.Map<string, Immutable.Set<string>>> {
  const tags = Signal.mapWithPrev(
    files,
    groupPathsByTag,
    Immutable.Map(),
    Immutable.Map()
  )

  // TODO(jaked) add directory indexes

  return tags;
}
