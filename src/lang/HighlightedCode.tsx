import React from 'react';
import Highlight, {defaultProps} from 'prism-react-renderer';
import Theme from './HighlightedCodeTheme';

export default ({children, className}) => {
  const language = 'typescript';
  // const language = className.replace(/language-/, '')
  return (
    <Highlight {...defaultProps} code={children} language={language} theme={Theme}>
      {({className, style, tokens, getLineProps, getTokenProps}) => (
        <pre className={className} style={{...style, padding: '20px'}}>
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
  )
}
