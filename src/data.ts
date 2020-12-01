import Immutable from 'immutable';
import React from 'react';
import Signal from './util/Signal';
import Try from './util/Try';
import Type from './lang/Type';

export type Types = 'meta' | 'pm' | 'mdx' | 'json' | 'jpeg' | 'table';

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

export type AstAnnotations = Map<unknown, Type>;

export type NoteFiles = {
  'meta'?: Content;
  'pm'?: Content;
  'mdx'?: Content;
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

// TODO(jaked)
// break this up so it's easier to return partial failure
// e.g. parse OK, typecheck OK, render OK
export interface CompiledFile {
  exportType: Type.ModuleType;
  exportValue: { [s: string]: Signal<any> };
  rendered: Signal<React.ReactNode>;
  astAnnotations?: AstAnnotations;
  problems: boolean;
  ast: Try<any>; // TODO(jaked)
}

export type CompiledNote = {
  name: string;
  meta: Signal<Meta>;
  files: NoteFiles;
  problems: Signal<boolean>;
  rendered: Signal<React.ReactNode>;

  // TODO(jaked) one note can publish multiple types? e.g. html + json
  publishedType: Signal<'html' | 'jpeg'>;

  exportType: Signal<Type.ModuleType>;
  exportValue: Signal<{ [s: string]: Signal<any> }>;
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

// indexed by path
export type Contents = Immutable.Map<string, Content>;

// indexed by name
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
