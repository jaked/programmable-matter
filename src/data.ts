import Immutable from 'immutable';
import React from 'react';
import Try from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as AcornJsxAst from './lang/acornJsxAst';
import * as Type from './lang/Type';

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
  tag: string;
  path: string;
  type: 'txt' | 'mdx' | 'json';
  content: string;
  version: number;
  compiled?: Try<Compiled>;
} & ({
  type: 'mdx';
  parsed?: Try<Parsed<MDXHAST.Root>>;
} | {
  type: 'json';
  parsed?: Try<Parsed<AcornJsxAst.Expression>>;
} | {
  type: 'txt';
  parsed?: Try<never>;
});

export type Notes = Immutable.Map<string, Note>;
