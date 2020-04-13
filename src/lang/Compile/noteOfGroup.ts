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

function sanitizeMeta(obj: any): data.Meta {
  // TODO(jaked) json-schema instead of hand-coding this?
  // TODO(jaked) report errors somehow
  const type =
    (obj.type === 'mdx' || obj.type === 'json' || obj.type === 'jpeg' || obj.type === 'table') ?
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

function parseMeta(content: string): data.Meta {
  let obj;
  try {
    obj = JSON5.parse(content);
  } catch (e) {
    console.log(e);
    return {};
  }

  return sanitizeMeta(obj);
}

export default function noteOfGroup(
  group: Immutable.Map<string, data.File>,
  tag: string
): data.Note {
  const files = group.entrySeq();
  const isIndex = files.some(([path, file]) => path.startsWith(Path.join(tag, 'index')));

  let meta: Signal<data.Meta>;
  if (isIndex) {
    // dirMeta of index.meta does not apply to index note
    const metaFile = files.find(([path, file]) => isIndexMeta(path));
    if (metaFile) {
      const [path, file] = metaFile;
      meta = file.content.map(parseMeta);
    } else {
      meta = Signal.ok<data.Meta>({});
    }
  } else {
    const indexMetaFile = files.find(([path, file]) => isIndexMeta(path));
    if (indexMetaFile) {
      const [path, file] = indexMetaFile;
      meta = file.content.map(parseMeta).map(meta => ({ ...meta.dirMeta }));
    } else {
      meta = Signal.ok<data.Meta>({});
    }
    const metaFile = files.find(([path, file]) => isNonIndexMeta(path));
    if (metaFile) {
      const [path, file] = metaFile;
      const meta2 = file.content.map(parseMeta);
      meta = Signal.join(meta, meta2).map(([meta, meta2]) => ({ ...meta, ...meta2 }));
    }
  }

  meta = meta.map(meta => {
    if (!('title' in meta)) {
      const title = Path.basename(tag);
      meta = { ...meta, title };
    }
    return meta;
  });

  const noteFiles: data.NoteFiles =
    files.reduce<data.NoteFiles>((obj, [path, file]) => {
      if (!isIndex && isIndexMeta(path)) return obj;
      return { ...obj, [file.type]: file };
    },
    {});

  const content: data.NoteContent =
    Object.keys(noteFiles).reduce<data.NoteContent>((obj, key) => {
      const file: data.File = noteFiles[key] ?? bug('expected ${key} file for ${tag}');
      if (key === 'jpeg') return obj;
      else {
        return { ...obj, [key]: file.content };
      }
    },
    {});

  return { tag, isIndex, meta, files: noteFiles, content };
}
