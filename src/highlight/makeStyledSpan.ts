import { StyledComponent, default as styled } from 'styled-components';

const spans = new Map<string, StyledComponent<'span', any, {}, never>>();
const makeStyledSpan = (style: string) => {
  let span = spans.get(style);
  if (!span) {
    const NODE_ENV = process.env.NODE_ENV;
    // disable styled-component check against creating components dynamically
    // see checkDynamicCreation.ts
    process.env.NODE_ENV = 'production';
    span = styled.span`${style}`;
    process.env.NODE_ENV = NODE_ENV;
    spans.set(style, span);
  }
  return span;
}

export default makeStyledSpan;
