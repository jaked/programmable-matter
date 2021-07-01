import * as Immer from 'immer';
import { bug } from './bug';
import Signal from './Signal';
import * as Name from './Name';
import { diffMap } from './diffMap';

function groupFilesByName<T>(
  files: Map<string, T>,
  oldFiles: Map<string, T>,
  oldGroupedFiles: Map<string, Map<string, T>>,
): Map<string, Map<string, T>> {
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
      group.set(path, curr as Immer.Draft<T>);
    });

    added.forEach((file, path) => {
      const name = Name.nameOfPath(path);
      const group = groupedFiles.get(name) ?? new Map<string, Immer.Draft<T>>();
      group.set(path, file as Immer.Draft<T>);
      groupedFiles.set(name, group);
    });
  });
}

export default function groupFilesByNameSignal<T>(
  files: Signal<Map<string, T>>
): Signal<Map<string, Map<string, T>>> {
  return Signal.mapWithPrev(
    files,
    groupFilesByName,
    new Map(),
    new Map()
  );
}
