import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import { diffMap } from '../../util/immutable/Map';
import { Content, Contents } from '../../data';

function groupFilesByName(
  files: Contents,
  oldFiles: Contents,
  oldGroupedFiles: Immutable.Map<string, Immutable.Map<string, Content>>,
): Immutable.Map<string, Immutable.Map<string, Content>> {

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
    const group = groupedFiles.get(name) || Immutable.Map<string, Content>();
    groupedFiles = groupedFiles.set(name, group.set(path, file));
  })

  return groupedFiles;
}

export default function groupFilesByNameSignal(
  files: Signal<Contents>
): Signal<Immutable.Map<string, Immutable.Map<string, Content>>> {
  const name = Signal.mapWithPrev(
    files,
    groupFilesByName,
    Immutable.Map(),
    Immutable.Map()
  )

  // TODO(jaked) add directory indexes

  return name;
}
