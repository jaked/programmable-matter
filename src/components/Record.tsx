import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { VariableSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import Signal from '../util/Signal';

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
`;

export type Field = {
  label: string,
  getter: (o: unknown) => unknown,
  setter: (o: unknown, v: unknown) => void,
  component: React.FunctionComponent<{ cell: Signal.Writable<unknown> }>
}

type CellFnProps = {
  rowIndex: number,
  columnIndex: number,
  style: object,
  data: { fields: Field[], cell: Signal.Writable<unknown> }
}

// defined outside the Record component so it is not recomputed on every render
const cellFn = ({ rowIndex, columnIndex, style, data: { fields, cell } } : CellFnProps) => {
  const field = fields[rowIndex];
  const borderTopWidth = rowIndex === 0 ? 1 : 0;
  const borderLeftWidth = columnIndex === 0 ? 1 : 0;

  if (columnIndex === 0) {
    return (
      <Box
        style={style}
        borderTopWidth={borderTopWidth}
        borderLeftWidth={borderLeftWidth}
      >
        {field.label}
      </Box>
    );
  } else {
    const fieldCell = cell.mapProjection(field.getter, field.setter);

    return (
      <Box
        style={style}
        borderTopWidth={borderTopWidth}
        borderLeftWidth={borderLeftWidth}
      >
        {field.component({ cell: fieldCell })}
      </Box>
    );
  }
}

type Props = {
  fields: Field[],
  cell: Signal.Writable<unknown>,
}

export const Record = ({ fields, cell }: Props) => {
  const gridFn = ({ height, width }) => {
    return [
      <VariableSizeGrid
        itemData={{ fields, cell }}
        columnCount={2}
        rowCount={fields.length}
        columnWidth={(col) => col === 0 ? 100 : 200}
        rowHeight={(row) => 30}
        height={height}
        width={width}
      >
        {cellFn}
      </VariableSizeGrid>
    ];
  }

  return (
    <AutoSizer>
      {gridFn}
    </AutoSizer>
  );
}
