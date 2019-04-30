import * as React from 'react';
import Grid from '@material-ui/core/Grid';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

interface State {
  content: string;
}

export class Main extends React.Component<{}, State> {
  state = {
    content: '# Hello World'
  }

  handleChange = (content: string) => {
    this.setState({ content })
  }

  render() {
    const { content } = this.state
    return (
      <Grid container>
        <Grid item xs={2} style={{ height: '100vh'}}>
          <Notes />
        </Grid>
        <Grid item xs={5}>
          <Editor content={content} onChange={this.handleChange} />
        </Grid>
        <Grid item xs={5}>
          <Catch>
            <Display content={content} />
          </Catch>
        </Grid>
      </Grid>
    );
  }
}
