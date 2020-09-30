import File from '../../files/File';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as data from '../../data';
import Type from '../Type';

export default function compileFilePm(
  file: File,
): Signal<data.CompiledFile> {
  return Signal.ok({
    exportType: Type.module({}),
    exportValue: { },
    rendered: Signal.ok('PM'),
    problems: false,
    ast: Try.err(new Error('unimplemented')),
  });
}