import Immutable from 'immutable';
import React from 'react';
import Signal from './util/Signal';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as ESTree from './lang/ESTree';
import Type from './lang/Type';

export type Types = 'mdx' | 'json' | 'txt' | 'jpeg' | 'table';

export interface Meta {
  type?: Types;
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

type NoteContent = {
  'mdx'?: string;
  'json'?: string;
  'txt'?: string;
}

export type Note = File & {
  tag: string;
  meta: Meta;
  type: Types;
  content: NoteContent;
};

type NoteParsed = {
  'mdx'?: Try<MDXHAST.Root>;
  'json'?: Try<ESTree.Expression>;
}

export type ParsedNote = Note & {
  parsed: NoteParsed;
}

export type ParsedNoteWithImports = ParsedNote & {
  imports: Set<string>;
}

export type CompiledNote = ParsedNoteWithImports & {
  compiled: Try<Compiled>;
}

// indexed by path
export type Files = Immutable.Map<string, Signal<File>>;

// indexed by tag
export type Notes = Immutable.Map<string, Signal<Note>>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type ParsedNotesWithImports = Immutable.Map<string, ParsedNoteWithImports>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
