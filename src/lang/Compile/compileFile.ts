import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import { CompiledFile, CompiledNotes, WritableContent } from '../../model';

import compileFileMeta from './compileFileMeta';
import compileFilePm from './compileFilePm';
import compileFileJson from './compileFileJson';
import compileFileTable from './compileFileTable';
import compileFileJpeg from './compileFileJpeg';
import compileFilePng from './compileFilePng';
import compileFileXml from './compileFileXml';

export default function compileFile(
  file: WritableContent,
  compiledFiles: Signal<Map<string, CompiledFile>>,
  compiledNotes: Signal<CompiledNotes>,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
  setSelected: (note: string) => void,
): CompiledFile {

  switch (file.type) {
    case 'meta':
      return compileFileMeta(file);

    case 'pm':
      return compileFilePm(file, compiledFiles, compiledNotes, setSelected);

    case 'json':
      return compileFileJson(file, compiledFiles, updateFile);

    case 'table':
      return compileFileTable(file, compiledFiles, compiledNotes, setSelected, updateFile, deleteFile);

    case 'jpeg':
      return compileFileJpeg(file);

    case 'png':
      return compileFilePng(file);

    case 'xml':
      return compileFileXml(file, compiledFiles, compiledNotes);

    default: bug(`unimplemented file type ${file.type}`);
  }
}
