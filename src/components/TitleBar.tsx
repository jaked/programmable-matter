import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';

type Props ={
  title: string | null;
}

const Box = styled(BoxBase)({
  padding: '6px',
  borderBottom: '1px solid #cccccc',
  height: '32px',
});

export default Signal.lift<Props>(({ title }) =>
  <Box>{title}</Box>
);
