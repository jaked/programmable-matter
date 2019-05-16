import * as Immutable from 'immutable';
import * as React from 'react';
import { Atom } from '@grammarly/focal';
import * as Focal from '@grammarly/focal';

import * as Parser from '../lang/parser';
import * as Render from '../lang/Render';
import * as Typecheck from '../lang/Typecheck';

interface Props {
  state: Atom<Immutable.Map<string, any>>;
  content: Atom<string | null>;
}

// we can't just lift Display because that lifts state as well as content
// then we can't access state as an Atom
// so we lift just the rendering of content
// TODO(jaked) there's probably a simpler way to do this
class Identity extends React.Component<{ tree: React.ReactNode }> {
  render() { return this.props.tree; }
}
const LiftedIdentity = Focal.lift(Identity);

export class Display extends React.Component<Props, {}> {
  render() {
    const tree =
      this.props.content.map(content => {
        if (content === null) {
          return <span>no note</span>;
        } else {
          // TODO(jaked)
          // I don't understand how errors are propagated with Atom
          // but if we let it bubble up here, the Catch handler doesn't catch it
          try {
            const ast = Parser.parse(content)
            // TODO(jaked)
            // environment should include identifiers in other pages
            Typecheck.checkMdx(ast, Render.initEnv);
            const env = Immutable.Map<string, any>();
            return Render.renderMdx(ast, env, this.props.state);
          } catch (err) {
            return <span>{err.toString()}</span>;
          }
        }
      });

    return <LiftedIdentity tree={tree} />;
  }
}
