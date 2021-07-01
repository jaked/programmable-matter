import React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';
import TitleBar from './TitleBar';

const HeaderBox = styled(Flex)({
  padding: '4px',
  borderBottom: '1px solid #cccccc',
  height: '33px',
});

const TitleBox = styled(Box)({
  flex: 1,
  padding: '2px',
})

type Props = {
  name: string | null;
  setName: (s: string) => void;
  editName: string | undefined;
  setEditName: (s: string | undefined) => void;
  focusEditor: () => void;
}

export default Signal.liftComponent<Props>(props => {
  if (props.name === null)
    return <HeaderBox />
  else
    return (
      <HeaderBox>
        <TitleBox>
          <TitleBar
            name={props.name}
            setName={props.setName}
            editName={props.editName}
            setEditName={props.setEditName}
            focusEditor={props.focusEditor}
          />
        </TitleBox>
      </HeaderBox>
    );
});
