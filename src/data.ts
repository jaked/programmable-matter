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

export type Parsed<Ast> = {
  ast: Ast;
  imports: Set<string>;
}

export interface Compiled {
  exportType: Type.ModuleType;
  exportValue: { [s: string]: Signal<any> };
  rendered: Signal<React.ReactNode>;
}

export type File = {
  path: string;
  version: number;
  buffer: Buffer;
}

export type NoteFiles = {
  'meta'?: File;
  'mdx'?: File;
  'json'?: File;
  'txt'?: File;
  'jpg'?: File;
  'table'?: File;
}

export type NoteContent = {
  'meta'?: string;
  'mdx'?: string;
  'json'?: string;
  'txt'?: string;
  'table'?: string;
}

export type Note = {
  tag: string;
  isIndex: boolean;
  meta: Meta;
  files: NoteFiles;
  content: NoteContent;
};

export type NoteParsed = {
  'meta'?: Try<ESTree.Expression>;
  'mdx'?: Try<MDXHAST.Root>;
  'json'?: Try<ESTree.Expression>;
  'table'?: Try<{}>; // TODO(jaked) table config
}

export type ParsedNote = Note & {
  parsed: NoteParsed;
}

export type ParsedNoteWithImports = ParsedNote & {
  imports: Set<string>;
}

export type NoteCompiled = {
  'mdx'?: Try<Compiled>;
  'json'?: Try<Compiled>;
  'txt'?: Try<Compiled>;
  'jpeg'?: Try<Compiled>;
  'table'?: Try<Compiled>;
}

export type CompiledNote = ParsedNoteWithImports & {
  compiled: NoteCompiled;
}

// indexed by path
export type Files = Immutable.Map<string, Signal<File>>;

// indexed by tag
export type Notes = Immutable.Map<string, Signal<Note>>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type ParsedNotesWithImports = Immutable.Map<string, ParsedNoteWithImports>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
