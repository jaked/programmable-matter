import { shell } from 'electron';
import * as Url from 'url';
import * as React from 'react';
import styled from 'styled-components';
import * as Name from '../util/Name';

// TODO(jaked) move context out of Render
import * as Render from '../lang/Render';

const A = styled.a`
:hover {
  cursor: pointer;
}
`;

export default function makeLink(
  moduleName: string,
  setSelected: (note: string) => void,
) {
  return function (props: { href: string, children?: React.ReactNode }) {
    // TODO(jaked) validate URL
    const url = Url.parse(props.href);
    if (url.protocol && url.slashes && url.hostname) {
      const onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        shell.openExternal(props.href);
      }
      return React.createElement(A, { ...props, href: props.href, onClick }, props.children);

    } else {
      // TODO(jaked) use Name.rewriteResolve here
      const name = Name.resolve(Name.dirname(moduleName), props.href);

      return React.createElement(Render.context.Consumer, {
        children: context => {
          switch (context) {
            case 'screen': {
              const onClick = (e: React.MouseEvent) => {
                e.preventDefault();
                setSelected(name);
              }
              return React.createElement(A, { href: '#', onClick }, props.children);
            }

            case 'server':
              const href = name.split('/').map(encodeURIComponent).join('/');
              return React.createElement('a', { href }, props.children);
            }
          }
        }
      );
    }
  }
}
