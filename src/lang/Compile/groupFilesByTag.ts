import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Tag from '../../util/Tag';
import { diffMap } from '../../util/immutable/Map';
import * as data from '../../data';

function groupFilesByTag(
  files: data.Files,
  oldFiles: data.Files,
  oldGroupedFiles: Immutable.Map<string, Immutable.Map<string, data.File>>,
): Immutable.Map<string, Immutable.Map<string, data.File>> {

  let groupedFiles = oldGroupedFiles;
  let { added, changed, deleted } = diffMap(oldFiles, files);

  deleted.forEach(path => {
    const tag = Tag.tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    const updatedGroup = group.delete(path);
    if (updatedGroup.size === 0)
      groupedFiles = groupedFiles.delete(tag);
    else
      groupedFiles = groupedFiles.set(tag, updatedGroup);
  });

  changed.forEach(([prev, curr], path) => {
    // TODO(jaked) can this ever happen for Filesystem?
    const tag = Tag.tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.set(path, curr));
  });

  added.forEach((file, path) => {
    const tag = Tag.tagOfPath(path);
    const group = groupedFiles.get(tag) || Immutable.Map<string, data.File>();
    groupedFiles = groupedFiles.set(tag, group.set(path, file));
  })

  return groupedFiles;
}

export default function groupFilesByTagSignal(
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
