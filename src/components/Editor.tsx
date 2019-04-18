import * as React from 'react';
import AceEditor from 'react-ace';
import 'brace/mode/jsx';
import 'brace/theme/chrome';

export class Editor extends React.Component<any, any> {
  render() {
    return (
      <AceEditor
        mode='jsx'
        theme='chrome'
        width='100hw'
        height='100vh'
        showGutter={false}
        tabSize={2}
        setOptions={{
          displayIndentGuides: false,
          showPrintMargin: false,
          useSoftTabs: true,
        }}
        focus
      />
    );
  }
}
