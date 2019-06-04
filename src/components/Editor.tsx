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
    // the <br/> here is essential:
    // the textarea is the same height as the pre [why?]
    // if the value has a trailing newline,
    // the textarea permits navigating to the following line
    // but the pre doesn't render anything on that line
    // so the textarea is a line short and scrolls up
    // (so its text is out of sync with the pre)
    // thus we add an extra linebreak to the pre
    return ([
      content,
      <br/>
    ]);
  }

  render() {
    if (this.props.content === null) {
      return <span>no note</span>
    } else {
      return (
        <div style={{
          fontFamily: 'monospace',
          fontSize: '11pt',
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
