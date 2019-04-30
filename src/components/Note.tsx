import * as React from 'react';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';

interface Props {
  content: string;
  selected: boolean;
}

interface State {

}

export class Note extends React.Component<Props, State> {
  render() {
    return (
      <ListItem
        button
        selected={this.props.selected}
        dense
        disableRipple
        disableGutters
      >
        <ListItemText primary={this.props.content} />
      </ListItem>
    );
  }
}
