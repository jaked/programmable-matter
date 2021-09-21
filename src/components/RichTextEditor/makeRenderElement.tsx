import React from 'react';
import { RenderElementProps } from 'slate-react';
import styled from 'styled-components';
import * as PMAST from '../../pmast';
import makeLink from '../makeLink';

const LiveCode = styled.pre`
  background-color: #eeeeee;
  border-radius: 10px;
  padding: 10px;
`;

const InlineLiveCode = styled.code`
  background-color: #eeeeee;
  border-radius: 5px;
  padding: 5px;
`;

const Code = styled.pre`
  background-color: #f7f7f7;
  margin-left: 10px;
  margin-right: 10px;
  padding: 10px;
`;

export default (
  moduleName: string,
  setSelected: (note: string) => void,
) => {
  const Link = makeLink(moduleName, setSelected);

  return ({ element, attributes, children }: RenderElementProps) => {
    if (PMAST.isCode(element)) {
      return <Code {...attributes}>
        <code>{children}</code>
      </Code>;

    } else if (PMAST.isLink(element)) {
      return React.createElement(Link, { ...attributes, href: element.href }, children);

    } else if (PMAST.isLiveCode(element)) {
      return <LiveCode {...attributes}>
        <code>{children}</code>
      </LiveCode>

    } else if (PMAST.isInlineLiveCode(element)) {
      return <InlineLiveCode {...attributes}>{children}</InlineLiveCode>

    } else {
      return React.createElement(element.type, attributes, children);
    }
  }
}
