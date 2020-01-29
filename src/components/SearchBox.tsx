import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

type Props = {
  search: string,
  onSearch: (search: string) => void,
  onKeyDown: (e: React.KeyboardEvent) => boolean,
}

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
});

const Box = styled(BoxBase)({}, borders);

export class SearchBox extends React.Component<Props, {}> {
  inputRef = React.createRef<HTMLInputElement>();

  constructor(props: Props) {
    super(props);
  }

  focus() {
    const input = this.inputRef.current;
    if (input) {
      input.setSelectionRange(0, input.value.length)
      input.focus();
    }
  }

  render() {
    const { search, onSearch, onKeyDown } = this.props;
    return (
      <Box width={1} padding={1}>
        <Box width={1} padding={1} borderWidth={1} borderStyle='solid'>
          <Input
            ref={this.inputRef}
            type='text'
            maxLength={100}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              e.preventDefault();
              onSearch(e.currentTarget.value);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (onKeyDown(e))
                e.preventDefault();
            }}
          />
        </Box>
      </Box>
    );
  }
}
