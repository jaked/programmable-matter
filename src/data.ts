import Immutable from 'immutable';
import React from 'react';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as AcornJsxAst from './lang/acornJsxAst';
import * as Type from './lang/Type';

export interface Meta {
  type?: 'mdx' | 'json' | 'txt' | 'ts';
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

export type Note = {
  meta: Meta;
  tag: string;
  path: string;
  type: 'mdx' | 'json' | 'txt' | 'ts';
  content: string;
  version: number;
}

export type ParsedNote = Note &
  ({
    type: 'mdx';
    parsed: Try<Parsed<MDXHAST.Root>>;
  } | {
    type: 'json';
    parsed: Try<Parsed<AcornJsxAst.Expression>>;
  } | {
    type: 'txt';
    parsed: Try<Parsed<string>>;
  } | {
    type: 'ts';
    parsed: Try<Parsed<AcornJsxAst.Program>>;
  });

export type CompiledNote = ParsedNote & {
  compiled: Try<Compiled>;
}

export type Notes = Immutable.Map<string, Note>;
export type ParsedNotes = Immutable.Map<string, ParsedNote>;
export type CompiledNotes = Immutable.Map<string, CompiledNote>;
