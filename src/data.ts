import Immutable from 'immutable';

import * as MDXHAST from './lang/mdxhast';

export interface Note {
  tag: string;
  content: string;
  version: number;
  compiled?: [ 'success', MDXHAST.Root ] | [ 'failure', any ];
}

export type Notes = Immutable.Map<string, Note>;
