import * as Immer from 'immer';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import { diffMap } from '../../util/diffMap';
import { Content, Contents } from '../../data';

function groupFilesByName(
  files: Contents,
  oldFiles: Contents,
  oldGroupedFiles: Map<string, Map<string, Content>>,
): Map<string, Map<string, Content>> {
  return Immer.produce(oldGroupedFiles, groupedFiles => {
    let { added, changed, deleted } = diffMap(oldFiles, files);

    deleted.forEach(path => {
      const name = Name.nameOfPath(path);
      const group = groupedFiles.get(name) ?? bug(`expected group for ${name}`);
      group.delete(path);
      if (group.size === 0)
        groupedFiles.delete(name);
    });

    changed.forEach(([prev, curr], path) => {
      // TODO(jaked) can this ever happen for Filesystem?
      const name = Name.nameOfPath(path);
      const group = groupedFiles.get(name) ?? bug(`expected group for ${name}`);
      group.set(path, curr);
    });

    added.forEach((file, path) => {
      const name = Name.nameOfPath(path);
      const group = groupedFiles.get(name) ?? new Map<string, Content>();
      group.set(path, file);
      groupedFiles.set(name, group);
    });
  });
}

export default function groupFilesByNameSignal(
  files: Signal<Contents>
): Signal<Map<string, Map<string, Content>>> {
  return Signal.mapWithPrev(
    files,
    groupFilesByName,
    new Map(),
    new Map()
  );
}
