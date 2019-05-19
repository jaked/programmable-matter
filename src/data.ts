import Immutable from 'immutable';
import React from 'react';
import { Try } from './util/Try';
import * as MDXHAST from './lang/mdxhast';
import * as Type from './lang/Type';

export interface Compiled {
  ast: Try<MDXHAST.Root>;
  imports: Try<Set<string>>;
  exportType: Try<Type.ObjectType>;
  exportValue: Try<{ [s: string]: any }>;
  rendered: Try<React.ReactNode>;
}

export interface Note {
  tag: string;
  content: string;
  version: number;
  compiled?: Compiled;
}

export type Notes = Immutable.Map<string, Note>;
