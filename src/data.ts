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

export interface Compiled {
  exportType: Type.ModuleType;
  exportValue: { [s: string]: Signal<any> };
  rendered: Signal<React.ReactNode>;
  astAnnotations?: AstAnnotations;
  problems: boolean;
}

export class File {
  path: string;
  bufferCell: Signal.Cell<Buffer>;

  constructor(path: string, bufferCell: Signal.Cell<Buffer>) {
    this.path = path;
    this.bufferCell = bufferCell;
  }
}

export type NoteFiles = {
  'meta'?: Signal<File>;
  'mdx'?: Signal<File>;
  'json'?: Signal<File>;
  'jpg'?: Signal<File>;
  'table'?: Signal<File>;
}

export type NoteContent = {
  'meta'?: Signal<string>;
  'mdx'?: Signal<string>;
  'json'?: Signal<string>;
  'table'?: Signal<string>;
}

export type Note = {
  tag: string;
  isIndex: boolean;
  meta: Signal<Meta>;
  files: NoteFiles;
  content: NoteContent;
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

export type NoteCompiled = {
  'meta'?: Signal<Compiled>;
  'mdx'?: Signal<Compiled>;
  'json'?: Signal<Compiled>;
  'jpeg'?: Signal<Compiled>;
  'table'?: Signal<Compiled>;
}

export type CompiledNote = ParsedNoteWithImports & {
  compiled: NoteCompiled;
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
