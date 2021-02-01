import React from 'react';

import Signal from './util/Signal';
import Type from './lang/Type';
import * as PMAST from './PMAST';

export type File = {
  mtimeMs: number;
  buffer: Buffer;
}

export type Files = Map<string, File>;

export type Types = 'meta' | 'pm' | 'json' | 'jpeg' | 'table';

export type Meta = {
  title?: string,
  tags?: Array<string>,
  layout?: string,
  publish?: boolean,
  dataType?: Type,
  dirMeta?: Meta,
}

export type AstAnnotations = Map<unknown, Type>;

export type NoteFiles = {
  'meta'?: Content;
  'pm'?: Content;
  'json'?: Content;
  'jpeg'?: Content;
  'table'?: Content;
}

export type TableFieldBase = {
  name: string;
  label: string;
}

export type TableFieldData = TableFieldBase &
  { kind: 'data', type: Type }

export type TableFieldMeta = TableFieldBase &
  { kind: 'meta', field: 'name' | 'title' | 'created' | 'updated' }

export type TableField = TableFieldData | TableFieldMeta

export type Table = {
  fields: TableField[];
}

export interface CompiledFile {
  ast: Signal<unknown>;
  exportType: Signal<Type.ModuleType>;
  astAnnotations?: Signal<AstAnnotations>;
  problems: Signal<boolean>;
  exportValue: Signal<Map<string, Signal<unknown>>>;
  rendered: Signal<React.ReactNode>;
}

export type CompiledNote = {
  name: string;
  type: Types;
  meta: Signal<Meta>;
  files: NoteFiles;
  problems: Signal<boolean>;
  rendered: Signal<React.ReactNode>;

  // TODO(jaked) one note can publish multiple types? e.g. html + json
  publishedType: Signal<'html' | 'jpeg'>;

  exportType: Signal<Type.ModuleType>;
  exportValue: Signal<Map<string, Signal<unknown>>>;
}

// file decoded / parsed into an editable / compilable representation
export type Content = {
  type: Types,
  path: string,
  content: Signal<unknown>,
  mtimeMs: Signal<number>, // TODO(jaked) drop
}
export type WritableContent = {
  type: Types,
  path: string,
  content: Signal.Writable<unknown>
  mtimeMs: Signal<number>, // TODO(jaked) drop
}

export type PMContent = {
  nodes: PMAST.Node[];
  meta: Meta;
}

// indexed by path
export type Contents = Map<string, Content>;
export type WritableContents = Map<string, WritableContent>;

// indexed by name
export type CompiledNotes = Map<string, CompiledNote>;
