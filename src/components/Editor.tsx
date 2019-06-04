import * as React from 'react';
import RSCEditor from './react-simple-code-editor/index';

interface Props {
  content: string | null;

  onChange: (content: string) => void;
}

export class Editor extends React.Component<Props, {}> {
  handleChange = (content: string) => {
    this.props.onChange(content)
  }

  highlight = (content: string) => {
    return <>{content}</>;
  }

  render() {
    if (this.props.content === null) {
      return <span>no note</span>
    } else {
      return (
        <div style={{
          fontFamily: 'monospace',
        }}>
          <RSCEditor
            value={this.props.content}
            onValueChange={this.handleChange}
            highlight={this.highlight}
          />
        </div>
      );
    }
  }
}
