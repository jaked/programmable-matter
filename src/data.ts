import Immutable from 'immutable';
import { Try } from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as Type from './lang/Type';

export interface Compiled {
  ast: Try<MDXHAST.Root>;
  imports: Try<Set<string>>;
  exports: Try<Type.ObjectType>;
  compiledAst: Try<MDXHAST.Root>;
}

export interface Note {
  tag: string;
  content: string;
  version: number;
  compiled?: Compiled;
}

export type Notes = Immutable.Map<string, Note>;
