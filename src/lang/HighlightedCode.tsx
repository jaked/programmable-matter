import React from 'react';
import Highlight, { defaultProps, Language } from 'prism-react-renderer';
import Theme from './HighlightedCodeTheme';

type Props = {
  language: Language;
  style?: React.CSSProperties;
  inline?: boolean;
}

function flatten(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(flatten).join('');
  else if (node === null || node === undefined) return '';
  else return String(node);
}

export const HighlightedCode: React.FunctionComponent<Props> =
 ({ children, language, style: componentStyle, inline }) => {
  const code = flatten(children).trimRight();
  if (inline) {
    return (
      <Highlight {...defaultProps} code={code} language={language} theme={Theme}>
        {({className, style, tokens, getLineProps, getTokenProps}) => (
          <code className={className} style={{...style, ...componentStyle}}>
            {tokens.map((line, i) => (
              <span key={i} {...getLineProps({line, key: i})}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({token, key})} />
                ))}
              </span>
            ))}
          </code>
        )}
      </Highlight>
    );
  } else {
    return (
      <Highlight {...defaultProps} code={code} language={language} theme={Theme}>
        {({className, style, tokens, getLineProps, getTokenProps}) => (
          <pre className={className} style={{...style, ...componentStyle}}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({line, key: i})}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({token, key})} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    );
  }
}

export default HighlightedCode;
