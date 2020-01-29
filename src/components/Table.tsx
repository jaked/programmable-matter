import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { VariableSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const Box = styled(BoxBase)({
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
});

export type Field = {
  label: string,
  accessor: (o: object) => any,
  width: number,
  component: React.FunctionComponent<{ data: any }>
}

type Props = {
  data: object[],
  fields: Field[]
}

export const Table = ({ data, fields }: Props) =>
  <AutoSizer>
    {({ height, width }) =>
      <VariableSizeGrid
        columnCount={fields.length}
        rowCount={data.length}
        columnWidth={(col) => fields[col].width}
        rowHeight={(row) => 30}
        height={height}
        width={width}
      >
        {({ rowIndex, columnIndex, style }) => {
          const object = data[rowIndex];
          const field = fields[columnIndex];
          const value = field.accessor(object);
          const Component = field.component;
          return (
            <Box style={style}>
              <Component data={value} />
            </Box>
          );
        }}
      </VariableSizeGrid>
    }
  </AutoSizer>
