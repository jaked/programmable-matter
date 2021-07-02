import * as Path from 'path';
import JSON5 from 'json5';

import * as PMAST from '../model/PMAST';
import * as Meta from '../model/Meta';
import * as model from '../model';

import Signal from '../util/Signal';
import * as Files from './files';

function typeOfPath(path: string): model.Types {
  const ext = Path.parse(path).ext;
  switch (ext) {
    case '.meta': return 'meta';
    case '.pm': return 'pm';
    case '.json': return 'json';
    case '.table': return 'table';
    case '.jpeg': return 'jpeg';
    case '.png': return 'png';
    case '.xml': return 'xml';
    default:
      throw new Error(`unhandled extension '${ext}' for '${path}'`);
  }
}

export const contents = Signal.mapMap(
  Signal.splitMapWritable(Files.files),
  (file, path) => {
    const type = typeOfPath(path);

    const mtimeMs = file.map(({ mtimeMs }) => mtimeMs);
    const buffer = file.mapInvertible(
      ({ buffer }) => buffer,
      buffer => ({ buffer, mtimeMs: Date.now(), deleted: false })
    );

    let content: Signal.Writable<unknown>;
    switch (type) {
      case 'pm':
        content = buffer.mapInvertible(
          // TODO(jaked) handle parse / validate errors
          buffer => {
            const obj = JSON5.parse(buffer.toString('utf8'));
            if (Array.isArray(obj)) {
              PMAST.validateNodes(obj);
              return {
                children: obj,
                selection: null,
                meta: {},
              };
            } else if ('nodes' in obj) {
              PMAST.validateNodes(obj.nodes);
              return {
                children: obj.nodes,
                selection: null,
                meta: Meta.validate(obj.meta)
              }
            } else if (obj.version === 1) {
              PMAST.validateNodes(obj.children);
              return {
                children: obj.children,
                selection: obj.selection,
                meta: Meta.validate(obj.meta)
              }
            }
          },
          obj => Buffer.from(JSON5.stringify({ version: 1, ...obj }, undefined, 2), 'utf8')
        );
        break;

      case 'jpeg':
        content = buffer;
        break;

      case 'png':
        content = buffer;
        break;

      default:
        content = buffer.mapInvertible(
          buffer => buffer.toString('utf8'),
          string => Buffer.from(string, 'utf8')
        );
    }
    return { type, path, mtimeMs, content };
  }
);
