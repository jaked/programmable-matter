import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as data from '../../data';
import File from '../../files/File';

import compileFileMeta from './compileFileMeta';
import compileFilePm from './compileFilePm';
import compileFileMdx from './compileFileMdx';
import compileFileJson from './compileFileJson';
import compileFileTable from './compileFileTable';
import compileFileJpeg from './compileFileJpeg';

export default function compileFile(
  file: File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  compiledNotes: Signal<data.CompiledNotes>,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
  setSelected: (note: string) => void,
): Signal<data.CompiledFile> {

  switch (file.type) {
    case 'meta':
      return compileFileMeta(file);

    case 'pm':
      return compileFilePm(file);

    case 'mdx':
      return compileFileMdx(file, compiledFiles, compiledNotes, setSelected);

    case 'json':
      return compileFileJson(file, compiledFiles, updateFile);

    case 'table':
      return compileFileTable(file, compiledFiles, compiledNotes, setSelected, updateFile, deleteFile);

    case 'jpeg':
      return compileFileJpeg(file);

    default: bug(`unimplemented file type ${file.type}`);
  }
}
