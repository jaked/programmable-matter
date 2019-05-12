import * as Immutable from 'immutable';
import * as React from 'react';
import { Atom } from '@grammarly/focal';

import * as Parser from '../lang/parser';
import * as Render from '../lang/Render';

interface Props {
  state: Atom<Immutable.Map<string, any>>;
  content: string | null;
}

export class Display extends React.Component<Props, {}> {
  render() {
    if (this.props.content === null) {
      return <span>no note</span>;
    } else {
      const ast = Parser.parse(this.props.content)
      return Render.renderFromMdx(ast, this.props.state);
    }
  }
}
