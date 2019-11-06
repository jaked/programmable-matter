import Immutable from 'immutable';
import React from 'react';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as ESTree from './lang/ESTree';
import * as Type from './lang/Type';

export type Types = 'mdx' | 'json' | 'txt' | 'ts' | 'jpeg';

export interface Meta {
  type?: Types;
  title?: string;
  tags?: Array<string>;
  layout?: string;
}

export type Parsed<Ast> = {
  ast: Ast;
  imports: Set<string>;
}

export interface Compiled {
  exportType: Type.ModuleType;
  exportValue: { [s: string]: any };
  rendered: () => React.ReactNode;
}

export type File = {
  path: string;
  version: number;
  buffer: Buffer;
}

export type Note = File & {
  tag: string;
  meta: Meta;
} & ({
  type: 'mdx' | 'json' | 'txt' | 'ts';
  content: string;
} | {
  type: 'jpeg';
});

// TODO(jaked) what do webpack et al. expose on image imports?
export type Jpeg = {
  buffer: Buffer;
}

// we are obliged to extend File instead of Note because (as far as I can tell)
// Typescript will otherwise refine only the Note fields when we switch on type
export type ParsedNote = File & {
  tag: string;
  meta: Meta;
} & ({
  type: 'mdx';
  content: string;
  parsed: Try<Parsed<MDXHAST.Root>>;
} | {
  type: 'json';
  content: string;
  parsed: Try<Parsed<ESTree.Expression>>;
} | {
  type: 'txt';
  content: string;
  parsed: Try<Parsed<string>>;
} | {
  type: 'ts';
  content: string;
  parsed: Try<Parsed<ESTree.Program>>;
} | {
  type: 'jpeg';
  parsed: Try<Parsed<Jpeg>>;
});

export type CompiledNote = ParsedNote & {
  compiled: Try<Compiled>;
}

// indexed by path
export type Files = Immutable.Map<string, File>;

// indexed by tag
export type Notes = Immutable.Map<string, Note>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
