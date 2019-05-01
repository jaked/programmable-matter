import * as React from 'react';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import * as data from '../data';

interface Props {
  note: data.Note;
  selected: boolean;
  onClick: () => void;
}

interface State {

}

export class Note extends React.Component<Props, State> {
  render() {
    const { note: { tag, content}, selected, onClick } = this.props;
    return (
      <ListItem
        button
        dense
        disableRipple
        selected={selected}
        onClick={onClick}
      >
        <ListItemText
          primary={tag}
          secondary={content}
        />
      </ListItem>
    );
  }
}
