import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

type Props = {
  search: string,
  onSearch: (search: string) => void,
  onKeyDown: (key: string) => boolean,
}

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
});

const Box = styled(BoxBase)({}, borders);

export class SearchBox extends React.Component<Props, {}> {
  inputRef = React.createRef<HTMLInputElement>();

  constructor(props: Props) {
    super(props);
  }

  focus() {
    this.inputRef.current && this.inputRef.current.focus();
  }

  render() {
    const { search, onSearch, onKeyDown } = this.props;
    return (
      <Box width={1} padding={1}>
        <Box width={1} padding={1} borderWidth={1} borderStyle='solid'>
          <Input
            ref={this.inputRef}
            width={1}
            type='text'
            maxLength={100}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              e.preventDefault();
              onSearch(e.currentTarget.value);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (onKeyDown(e.key))
                e.preventDefault();
            }}
          />
        </Box>
      </Box>
    );
  }
}
