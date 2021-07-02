import Signal from '../util/Signal';
import Filesystem from '../files/Filesystem';
import * as model from '../model';

import groupFilesByName from '../util/groupFilesByName';

const emptyBuffer = Buffer.from('');

const files = Signal.cellOk<model.Files>(new Map());

let filesVersions: model.Files[] = [];
let filesVersionIndex = -1; // index of the current version
export const filesWithVersions = files.mapInvertible(
  files => files,
  files => {
    filesVersions.splice(filesVersionIndex + 1);
    while (filesVersions.length >= 200)
      filesVersions.shift();
    filesVersions.push(files);
    filesVersionIndex = filesVersions.length - 1;
    return files;
  },
  true // eager
)

export let filesystem = Filesystem(process.argv[process.argv.length - 1], filesWithVersions);

function setFiles(filesVersion: model.Files) {
  const mtimeMs = Date.now();
  const newFiles: model.Files = new Map();
  filesVersion.forEach((file, path) => {
    newFiles.set(path, { ...file, mtimeMs });
  });
  for (const path of filesystem.fsPaths()) {
    if (!filesVersion.has(path)) {
      newFiles.set(path, { deleted: true, mtimeMs, buffer: emptyBuffer })
    }
  }
  files.setOk(newFiles);
}

export const globalUndo = () => {
  if (filesVersionIndex > 0) {
    filesVersionIndex -= 1;
    setFiles(filesVersions[filesVersionIndex]);
  }
}

export const globalRedo = () => {
  if (filesVersionIndex < filesVersions.length - 1) {
    filesVersionIndex += 1;
    setFiles(filesVersions[filesVersionIndex]);
  }
}

export async function setPath(path: string) {
  await filesystem.close();
  files.setOk(new Map());
  filesVersions = [];
  filesVersionIndex = -1;
  filesystem = Filesystem(path, filesWithVersions);
}

export const filesByNameSignal: Signal<Map<string, unknown>> =
  groupFilesByName(filesWithVersions)
