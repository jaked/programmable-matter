import Signal from '../util/Signal';
import Filesystem from '../files/Filesystem';
import * as model from '../model';

import groupFilesByName from '../util/groupFilesByName';

const filesCell = Signal.cellOk<model.Files>(new Map());

export let filesystem = Filesystem(process.argv[process.argv.length - 1], filesCell);

export async function setPath(path: string) {
  await filesystem.close();
  filesCell.setOk(new Map());
  filesystem = Filesystem(path, filesCell);
}

export const files = Signal.filterMapWritable(filesCell, file => !file.deleted);

export const filesByNameSignal = groupFilesByName(files)
