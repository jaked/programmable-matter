import Immutable from 'immutable';

export interface Note {
  tag: string;
  content: string;
}

export type Notes = Immutable.Map<string, Note>;
