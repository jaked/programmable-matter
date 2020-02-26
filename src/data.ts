import Immutable from 'immutable';
import React from 'react';
import Signal from './util/Signal';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as ESTree from './lang/ESTree';
import Type from './lang/Type';

export type Types = 'meta' | 'mdx' | 'json' | 'txt' | 'jpeg' | 'table';

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

export type File = {
  path: string;
  version: number;
  buffer: Buffer;
}

export type NoteFiles = {
  'meta'?: Signal<File>;
  'mdx'?: Signal<File>;
  'json'?: Signal<File>;
  'txt'?: Signal<File>;
  'jpg'?: Signal<File>;
  'table'?: Signal<File>;
}

export type NoteContent = {
  'meta'?: Signal<string>;
  'mdx'?: Signal<string>;
  'json'?: Signal<string>;
  'txt'?: Signal<string>;
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
  'table'?: Signal<{}>; // TODO(jaked) table config
}

export type ParsedNote = Note & {
  parsed: NoteParsed;
}

export type ParsedNoteWithImports = ParsedNote & {
  imports: Signal<Immutable.Set<string>>;
}

export type NoteCompiled = {
  'mdx'?: Signal<Compiled>;
  'json'?: Signal<Compiled>;
  'txt'?: Signal<Compiled>;
  'jpeg'?: Signal<Compiled>;
  'table'?: Signal<Compiled>;
}

export type CompiledNote = ParsedNoteWithImports & {
  compiled: NoteCompiled;
}

// indexed by path
export type Files = Immutable.Map<string, Signal<File>>;

// indexed by tag
export type Notes = Immutable.Map<string, Note>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type ParsedNotesWithImports = Immutable.Map<string, ParsedNoteWithImports>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
