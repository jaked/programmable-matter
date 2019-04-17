import * as React from 'react';
import AceEditor from 'react-ace';
import 'brace/mode/jsx';
import 'brace/theme/monokai';

export class Editor extends React.Component<any, any> {
  render() {
    return (
      <AceEditor
        mode='jsx'
        theme='monokai'
        width='100hw'
        height='100vh'
        tabSize={2}
        focus
      />
    );
  }
}
