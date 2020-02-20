import * as Path from 'path';
import * as Immutable from 'immutable';
import JSON5 from 'json5';
import Signal from '../../util/Signal';
import * as Parse from '../Parse';
import { bug } from '../../util/bug';
import * as data from '../../data';

function isIndexMeta(path: string) {
  return Path.parse(path).base === 'index.meta';
}

function isNonIndexMeta(path: string) {
  const pathParts = Path.parse(path);
  return pathParts.ext === '.meta' && pathParts.name !== 'index';
}

function typeOfPath(path: string): data.Types | undefined {
  const pathParts = Path.parse(path);

  let type: undefined | data.Types = undefined;
  if (pathParts.ext) {
    switch (pathParts.ext) {
      case '.meta': type = 'meta'; break;
      case '.md': type = 'mdx'; break; // TODO(jaked) support MD without X
      case '.mdx': type = 'mdx'; break;
      case '.json': type = 'json'; break;
      case '.txt': type = 'txt'; break;
      case '.table': type = 'table'; break;
      case '.JPG': type = 'jpeg'; break;
      case '.jpg': type = 'jpeg'; break;
      case '.jpeg': type = 'jpeg'; break;
      default:
        // TODO(jaked) throwing here fails the whole UI
        // need to encode the error in Note somehow
        // or avoid joining the map values
        console.log(`unhandled extension '${pathParts.ext}' for '${path}'`);
    }
  }
  return type;
}

function sanitizeMeta(obj: any): data.Meta {
  // TODO(jaked) json-schema instead of hand-coding this?
  // TODO(jaked) report errors somehow
  const type =
    (obj.type === 'mdx' || obj.type === 'json' || obj.type === 'txt' || obj.type === 'jpeg' || obj.type === 'table') ?
    { type: obj.type } : {};

  const title =
    typeof obj.title === 'string' ?
    { title: obj.title } : {};

  const tags =
    (Array.isArray(obj.tags) && obj.tags.every(s => typeof s === 'string')) ?
    { tags: obj.tags } : {};

  const layout =
    typeof obj.layout === 'string' ?
    { layout: obj.layout } : {};

  let dataType = {}
  if (typeof obj.dataType === 'string') {
    try {
      dataType = { dataType: Parse.parseType(obj.dataType) }
    } catch (e) {
      // TODO(jaked) how to surface these?
      console.log(e)
    }
  }

  const dirMeta =
    typeof obj.dirMeta === 'object' ?
    { dirMeta: sanitizeMeta(obj.dirMeta) } : {};

  return { ...type, ...title, ...tags, ...layout, ...dataType, ...dirMeta };
}

function parseMeta(file: data.File): data.Meta {
  let obj;
  try {
    obj = JSON5.parse(file.buffer.toString('utf8'));
  } catch (e) {
    console.log(e);
    return {};
  }

  return sanitizeMeta(obj);
}

export default function noteOfGroup(
  group: Immutable.Map<string, Signal<data.File>>,
  tag: string
): Signal<data.Note> {
  return Signal.label(tag, Signal.join(...group.values()).map<data.Note>(files => {

    const isIndex = files.some(file => file.path.startsWith(Path.join(tag, 'index')));

    let meta: data.Meta = {};
    if (isIndex) {
      // dirMeta of index.meta does not apply to index note
      const metaFile = files.find(file => isIndexMeta(file.path));
      if (metaFile) meta = { ...meta, ...parseMeta(metaFile)};
    } else {
      const indexMetaFile = files.find(file => isIndexMeta(file.path));
      if (indexMetaFile) meta = { ...meta, ...parseMeta(indexMetaFile).dirMeta }
      const metaFile = files.find(file => isNonIndexMeta(file.path));
      if (metaFile) meta = { ...meta, ...parseMeta(metaFile)};
    }

    const noteFiles: data.NoteFiles =
      files.reduce<data.NoteFiles>((obj, file) => {
        if (!isIndex && isIndexMeta(file.path)) return obj;
        const type = typeOfPath(file.path) ?? 'mdx';
        return { ...obj, [type]: file };
      },
      {});

    const content: data.NoteContent =
      Object.keys(noteFiles).reduce<data.NoteContent>((obj, key) => {
        const file = noteFiles[key] ?? bug('expected ${key} file for ${tag}');
        if (key === 'jpeg') return obj;
        else {
          const content = file.buffer.toString('utf8');
          return { ...obj, [key]: content };
        }
      },
      {});

    return { tag, isIndex, meta, files: noteFiles, content };
  }));
}
