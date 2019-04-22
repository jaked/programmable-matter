import * as React from 'react';
import AceEditor from 'react-ace';
import 'brace/mode/jsx';
import 'brace/theme/chrome';

interface Props {
  content: string;
  
  onChange: (content: string) => void;
}

export class Editor extends React.Component<Props, {}> {
  handleChange = (content: string) => {
    this.props.onChange(content)
  }
  
  render() {
    return (
      <AceEditor
        value={this.props.content}
        onChange={this.handleChange}
        mode='jsx'
        theme='chrome'
        width='100%'
        height='100%'
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
