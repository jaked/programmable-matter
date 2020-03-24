import * as Path from 'path';
import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import { diffMap } from '../../util/immutable/Map';
import * as data from '../../data';

const debug = false;

function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir;
  else return Path.join(pathParts.dir, pathParts.name);
}

function isIndexMeta(path: string) {
  return Path.parse(path).base === 'index.meta';
}

function isIndexMetaFor(path: string, tag: string) {
  return isIndexMeta(path) && Path.dirname(path) === Path.dirname(tag);
}

export default function groupFilesByTag(
  files: data.Files,
  oldFiles: data.Files,
  oldGroupedFiles: Immutable.Map<string, Immutable.Map<string, Signal<data.File>>>
): Immutable.Map<string, Immutable.Map<string, Signal<data.File>>> {
  // TODO(jaked)
  // seems like we could extract an abstraction here to Signal
  // i.e. an incrementally-maintained view of a join, somehow

  let groupedFiles = oldGroupedFiles;
  let { added, changed, deleted } = diffMap(oldFiles, files);

  // first, handle updates of non-.meta files, so groupedFiles has correct tags
  deleted.forEach(path => {
    if (debug) console.log(`${path} deleted`);
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.delete(path));
  });

  changed.forEach(([prev, curr], path) => {
    // TODO(jaked) can this ever happen for Filesystem?
    if (debug) console.log(`${path} signal changed`);
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.set(path, curr));
  });

  added.forEach((v, path) => {
    if (debug) console.log(`${path} added`);
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || Immutable.Map();
    groupedFiles = groupedFiles.set(tag, group.set(path, v));
  });

  // add dummy index notes for all dirs
  // TODO(jaked) need to delete old dummies if all real files are deleted
  groupedFiles.forEach((_, tag) => {
    const dirname = Path.dirname(tag);
    if (dirname !== '.') {
      const dirs = dirname.split('/');
      let dir = '';
      for (let i = 0; i < dirs.length; i++) {
        dir = Path.join(dir, dirs[i]);
        if (!groupedFiles.has(dir)) {
          const fileSignal = Signal.ok({
            path: Path.join(dir, 'index'),
            buffer: Buffer.from('')
          });
          added = added.set(dir, fileSignal);
          const group = Immutable.Map({ [dir]: fileSignal });
          groupedFiles = groupedFiles.set(dir, group);
        }
      }
    }
  });

  // next, update join for changed index.meta files
  groupedFiles = groupedFiles.map((group, tag) => {
    deleted.forEach(path => {
      if (isIndexMetaFor(path, tag)) {
        group = group.delete(path);
      }
    });

    changed.forEach(([prev, curr], path) => {
      if (isIndexMetaFor(path, tag)) {
        group = group.set(path, curr);
      }
    });

    added.forEach((v, path) => {
      if (isIndexMetaFor(path, tag)) {
        group = group.set(path, v);
      }
    });

    return group;
  });

  // finally, update join for changed non-index.meta files
  files.forEach((file, path) => {
    if (isIndexMeta(path)) {
      const metaPath = path;

      deleted.forEach(path => {
        if (!isIndexMeta(path)) {
          const tag = tagOfPath(path);
          if (isIndexMetaFor(metaPath, tag)) {
            const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
            if (group.size === 1) // last non-index.meta file was deleted
              groupedFiles = groupedFiles.set(tag, group.delete(metaPath));
          }
        }
      });

      changed.forEach((_, path) => {
        if (!isIndexMeta(path)) {
          const tag = tagOfPath(path);
          if (isIndexMetaFor(metaPath, tag)) {
            const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
            groupedFiles = groupedFiles.set(tag, group.set(metaPath, file));
          }
        }
      });

      added.forEach((_, path) => {
        if (!isIndexMeta(path)) {
          const tag = tagOfPath(path);
          if (isIndexMetaFor(metaPath, tag)) {
            const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
            groupedFiles = groupedFiles.set(tag, group.set(metaPath, file));
          }
        }
      });
    }
  })

  groupedFiles = groupedFiles.filter(group => group.size > 0);

  return groupedFiles;
}
