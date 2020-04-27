import * as Path from 'path';
import Immutable from 'immutable';
import React from 'react';
import Signal from './util/Signal';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as ESTree from './lang/ESTree';
import Type from './lang/Type';

export type Types = 'meta' | 'mdx' | 'json' | 'jpeg' | 'table';

export interface Meta {
  title?: string;
  tags?: Array<string>;
  layout?: string;
  dataType?: Type;
  dirMeta?: Meta;
}

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

export type Note = {
  tag: string;
  isIndex: boolean;
  meta: Signal<Meta>;
  files: NoteFiles;
};

export type NoteParsed = {
  'meta'?: Signal<ESTree.Expression>;
  'mdx'?: Signal<MDXHAST.Root>;
  'json'?: Signal<ESTree.Expression>;
  'table'?: Signal<ESTree.Expression>;
}

export type ParsedNote = Note & {
  parsed: NoteParsed;
}

export type ParsedNoteWithImports = ParsedNote & {
  imports: Signal<Immutable.Set<string>>;
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

export type CompiledNote = ParsedNoteWithImports & {
  problems: Signal<boolean>;
  rendered: Signal<React.ReactNode>;
  exportType: Signal<Type.ModuleType>;
  exportValue: Signal<{ [s: string]: Signal<any> }>;
}

// indexed by path
export type Files = Immutable.Map<string, File>;

// indexed by tag
export type Notes = Immutable.Map<string, Note>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type ParsedNotesWithImports = Immutable.Map<string, ParsedNoteWithImports>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
