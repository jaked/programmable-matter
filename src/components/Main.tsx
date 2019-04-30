import * as React from 'react';
import Grid from '@material-ui/core/Grid';

import * as data from '../data';
import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

interface Props {

}

interface State {
  notes: Array<data.Note>;
  selected: string | null;
}

export class Main extends React.Component<{}, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      notes: [
        { tag: 'one', content: `# Hello world` },
        { tag: 'two', content: `this is a note` },
        { tag: 'three', content: `this is **another** note` },
      ],
      selected: 'one',
    }
    this.handleSelect = this.handleSelect.bind(this)
    this.handleChange = this.handleChange.bind(this)
  }

  handleSelect(tag: string) {
    this.setState({
      selected: tag
    });
  }

  handleChange(content: string) {
    this.setState(state => ({
      notes: state.notes.map(note =>
        note.tag !== state.selected ?
        note :
        // TODO(jaked) is there a copying assign?
        Object.assign(note, { content })
      )
    }));
  }

  render() {
    // TODO(jaked) ugh
    const content =
      this.state.selected &&
      Object.assign(
        {},
        ...this.state.notes.map(({ tag, content }) => {
          return { [tag]: content };
        }))
      [this.state.selected]

      return (
      <Grid container>
        <Grid item xs={2} style={{ height: '100vh'}}>
          <Notes
            notes={this.state.notes}
            selected={this.state.selected}
            onSelect={this.handleSelect}
          />
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
