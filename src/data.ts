import Immutable from 'immutable';
import React from 'react';
import Signal from './util/Signal';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as ESTree from './lang/ESTree';
import Type from './lang/Type';

export type Types = 'mdx' | 'json' | 'txt' | 'jpeg';

export interface Meta {
  type?: Types;
  title?: string;
  tags?: Array<string>;
  layout?: string;
  dataType?: Type;
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

export type Note = File & {
  tag: string;
  meta: Meta;
  type: Types;
  content: string;
};

export type ParsedNote = Note & {
  imports: Set<string>;
} & ({
  type: 'mdx';
  ast: Try<MDXHAST.Root>;
} | {
  type: 'json';
  ast: Try<ESTree.Expression>;
} | {
  type: 'txt';
} | {
  type: 'jpeg';
});

export type CompiledNote = ParsedNote & {
  compiled: Try<Compiled>;
}

// indexed by path
export type Files = Immutable.Map<string, Signal<File>>;

// indexed by tag
export type Notes = Immutable.Map<string, Signal<Note>>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
