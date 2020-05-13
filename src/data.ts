import * as Path from 'path';
import Immutable from 'immutable';
import React from 'react';
import Signal from './util/Signal';
import Try from './util/Try';
import Type from './lang/Type';

export type Types = 'meta' | 'mdx' | 'json' | 'jpeg' | 'table';

export type MetaProps = {
  title?: string,
  tags?: Array<string>,
  layout?: string,
  publish?: boolean,
  dataType?: Type,
  dirMeta?: Meta,
}
export const Meta = Immutable.Record<MetaProps>({
  title: undefined,
  tags: undefined,
  layout: undefined,
  publish: undefined,
  dataType: undefined,
  dirMeta: undefined,
}, 'Meta')
export type Meta = Immutable.RecordOf<MetaProps>;

export type AstAnnotations = Map<unknown, Try<Type>>;

export class File {
  path: string;
  bufferCell: Signal.Cell<Buffer>;

  constructor(path: string, bufferCell: Signal.Cell<Buffer>) {
    this.path = path;
    this.bufferCell = bufferCell;
  }

  get content() {
    return this.bufferCell.map(buffer => buffer.toString('utf8'));
  }

  private typeOfExt(ext: string): Types {
    switch(ext) {
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

export type NoteFiles = {
  'meta'?: File;
  'mdx'?: File;
  'json'?: File;
  'jpeg'?: File;
  'table'?: File;
}

export type TableFieldBase = {
  name: string;
  label: string;
}

export type TableFieldData = TableFieldBase &
  { kind: 'data', type: Type }

export type TableFieldMeta = TableFieldBase &
  { kind: 'meta', field: 'tag' | 'title' | 'created' | 'updated' }

export type TableField = TableFieldData | TableFieldMeta

export type Table = {
  fields: TableField[];
}

// TODO(jaked)
// break this up so it's easier to return partial failure
// e.g. parse OK, typecheck OK, render OK
export interface Compiled {
  exportType: Type.ModuleType;
  exportValue: { [s: string]: Signal<any> };
  rendered: Signal<React.ReactNode>;
  astAnnotations?: AstAnnotations;
  problems: boolean;
}

export type CompiledFile = Compiled & {
  ast: Try<any>; // TODO(jaked)
}

export type CompiledNote = {
  tag: string;
  isIndex: boolean;
  meta: Signal<Meta>;
  files: NoteFiles;
  problems: Signal<boolean>;
  rendered: Signal<React.ReactNode>;

  // TODO(jaked) one note can publish multiple types? e.g. html + json
  publishedType: Signal<'html' | 'jpeg'>;

  exportType: Signal<Type.ModuleType>;
  exportValue: Signal<{ [s: string]: Signal<any> }>;
}

// indexed by path
export type Files = Immutable.Map<string, File>;

// indexed by tag
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
