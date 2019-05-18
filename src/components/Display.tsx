import * as Immutable from 'immutable';
import * as React from 'react';
import { Atom, ReadOnlyAtom } from '@grammarly/focal';
import * as Focal from '@grammarly/focal';

import * as data from './../data';
import * as Parser from '../lang/parser';
import * as Render from '../lang/Render';
import * as Typecheck from '../lang/Typecheck';

interface Props {
  state: Atom<Immutable.Map<string, any>>;
  selected: ReadOnlyAtom<string | null>;
  compiledNotes: ReadOnlyAtom<data.Notes>;
}

// we can't just lift Display because that lifts state as well as content
// then we can't access state as an Atom
// so we lift just the rendering of content
// TODO(jaked) there's probably a simpler way to do this
class Identity extends React.Component<{ tree: React.ReactNode }> {
  render() { return this.props.tree; }
}
const LiftedIdentity = Focal.lift(Identity);

export function Display({ state, selected, compiledNotes }: Props) {
  const tree =
    Atom.combine(selected, compiledNotes, (selected, compiledNotes) => {
      if (selected) {
        const note = compiledNotes.get(selected);
        if (note && note.compiled && note.compiled) {
          const compiled = note.compiled;
          switch (compiled[0]) {
            case 'success':
              try {
                const ast = compiled[1];
                // TODO(jaked)
                // environment should include identifiers in other pages
                Typecheck.checkMdx(ast, Render.initEnv);
                const env = Immutable.Map<string, any>();
                return Render.renderMdx(ast, env, state);
              } catch (e) {
                return <span>e.toString()</span>
              }
            case 'failure':
              return <span>compiled[1].toString()</span>
          }
        } else {
          return <span>no note</span>;
        }
      } else {
        return <span>no note</span>;
      }
    });

  return <LiftedIdentity tree={tree} />;
}
