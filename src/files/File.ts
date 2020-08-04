import * as Path from 'path';
import Signal from '../util/Signal';

// TODO(jaked) should handle type elsewhere maybe
import { Types } from '../data';

export default class File {
  path: string;
  cell: Signal.Cell<{ buffer: Buffer; mtimeMs: number; }>;

  constructor(
    path: string,
    buffer: Buffer,
    mtimeMs: number = 0,
    onChange: () => void = () => { }
  ) {
    this.path = path;
    this.cell = Signal.cellOk({ buffer, mtimeMs }, onChange);
  }

  get content() {
    return this.cell.map(cell => cell.buffer.toString('utf8'));
  }


  private typeOfExt(ext: string): Types {
    switch (ext) {
      case '.meta': return 'meta';
      case '.mdx': return 'mdx';
      case '.json': return 'json';
      case '.table': return 'table';
      case '.jpeg': return 'jpeg';
      default:
        throw new Error(`unhandled extension '${ext}' for '${this.path}'`);
    }
  }

  get type() {
    return this.typeOfExt(Path.parse(this.path).ext);
  }
}
