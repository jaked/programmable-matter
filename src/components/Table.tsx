import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { VariableSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const Box = styled(BoxBase)`
  border-style: solid;
  border-color: #cccccc;
  border-top-width: ${props => props.borderTopWidth}px;
  border-left-width: ${props => props.borderLeftWidth}px;
  border-right-width: 1px;
  border-bottom-width: 1px;
  padding: 6px;

  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;

  :hover {
    cursor: pointer;
  }
`;

export type Field = {
  label: string,
  accessor: (o: object) => any,
  width: number,
  component: React.FunctionComponent<{ data: any }>
}

type Props = {
  data: object[],
  fields: Field[],
  onSelect: (tag: string) => void
}

export const Table = ({ data, fields, onSelect }: Props) =>
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
          const borderTopWidth = rowIndex === 0 ? 1 : 0;
          const borderLeftWidth = columnIndex === 0 ? 1 : 0;

          // TODO(jaked)
          // handle record IDs generally
          // create one function for whole row
          const onClick = () => onSelect(object['id']);

          return (
            <Box
              style={style}
              borderTopWidth={borderTopWidth}
              borderLeftWidth={borderLeftWidth}
              onClick={onClick}
            >
              <Component data={value} />
            </Box>
          );
        }}
      </VariableSizeGrid>
    }
  </AutoSizer>
