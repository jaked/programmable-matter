import { remote } from 'electron';
import * as Url from 'url';
import * as React from 'react';
import styled from 'styled-components';
import * as Name from '../util/Name';

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
        remote.shell.openExternal(props.href);
      }
      return React.createElement(A, { ...props, href: props.href, onClick }, props.children);
    } else {
      // TODO(jaked) use Name.rewriteResolve here
      const name = Name.resolve(Name.dirname(moduleName), props.href);

      const onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setSelected(name);
      }
      // this href is used when note is rendered statically
      // TODO(jaked)
      // handle path components properly
      // handle mounting note tree somewhere other than / ?
      const href = `/${encodeURIComponent(name)}`;
      return React.createElement(A, { ...props, href, onClick }, props.children);
    }
  }
}
