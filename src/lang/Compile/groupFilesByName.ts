import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import { diffMap } from '../../util/immutable/Map';
import * as data from '../../data';
import File from '../../files/File';

function groupFilesByName(
  files: data.Files,
  oldFiles: data.Files,
  oldGroupedFiles: Immutable.Map<string, Immutable.Map<string, File>>,
): Immutable.Map<string, Immutable.Map<string, File>> {

  let groupedFiles = oldGroupedFiles;
  let { added, changed, deleted } = diffMap(oldFiles, files);

  deleted.forEach(path => {
    const name = Name.nameOfPath(path);
    const group = groupedFiles.get(name) || bug(`expected group for ${name}`);
    const updatedGroup = group.delete(path);
    if (updatedGroup.size === 0)
      groupedFiles = groupedFiles.delete(name);
    else
      groupedFiles = groupedFiles.set(name, updatedGroup);
  });

  changed.forEach(([prev, curr], path) => {
    // TODO(jaked) can this ever happen for Filesystem?
    const name = Name.nameOfPath(path);
    const group = groupedFiles.get(name) || bug(`expected group for ${name}`);
    groupedFiles = groupedFiles.set(name, group.set(path, curr));
  });

  added.forEach((file, path) => {
    const name = Name.nameOfPath(path);
    const group = groupedFiles.get(name) || Immutable.Map<string, File>();
    groupedFiles = groupedFiles.set(name, group.set(path, file));
  })

  return groupedFiles;
}

export default function groupFilesByNameSignal(
  files: Signal<data.Files>
): Signal<Immutable.Map<string, Immutable.Map<string, File>>> {
  const name = Signal.mapWithPrev(
    files,
    groupFilesByName,
    Immutable.Map(),
    Immutable.Map()
  )

  // TODO(jaked) add directory indexes

  return name;
}
