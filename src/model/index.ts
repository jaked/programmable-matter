import React from 'react';

import Try from '../util/Try';
import Signal from '../util/Signal';
import Type from '../lang/Type';
import * as PMAST from '../model/PMAST';
import * as ESTree from '../lang/ESTree';

// TODO(jaked) a lot of this doesn't belong here

export type File = {
  mtimeMs: number;
  buffer: Buffer;
}

export type Files = Map<string, File>;

export type Types = 'meta' | 'pm' | 'json' | 'jpeg' | 'png' | 'table' | 'xml';

export type Meta = {
  title?: string,
  tags?: Array<string>,
  layout?: string,
  publish?: boolean,
  dataType?: Type,
  dirMeta?: Meta,
}

export type Interface = Try<{ type: Type, dynamic: boolean, mutable?: 'Code' | 'Session' }>;
export type InterfaceMap = Map<ESTree.Node, Interface>;

export type NoteFiles = {
  'meta'?: Content;
  'pm'?: Content;
  'json'?: Content;
  'jpeg'?: Content;
  'png'?: Content;
  'table'?: Content;
  'xml'?: Content;
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
  interfaceMap?: Signal<InterfaceMap>;
  problems: Signal<boolean>;
  rendered: Signal<React.ReactNode>;

  exportInterface: Signal<Map<string, Interface>>;
  exportValue: Signal<Map<string, unknown>>;

  // filled in only for .pm files
  html?: Signal<string>;
  js?: Signal<string>;
}

export type CompiledNote = {
  name: string;
  type: Types;
  meta: Signal<Meta>;
  files: NoteFiles;
  problems: Signal<boolean>;
  rendered: Signal<React.ReactNode>;

  exportInterface: Signal<Map<string, Interface>>;
  exportValue: Signal<Map<string, unknown>>;

  // passed through from CompiledFile for .pm file
  html?: Signal<string>;
  js?: Signal<string>;
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
