import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { VariableSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import { bug } from '../util/bug';
import Signal from '../util/Signal';
import * as model from '../model';

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
  table: model.TableValue<string, unknown>,
  fields: Field[],
  onSelect: (name: string) => void
}

let measureTextCanvas: any = undefined

function measureText(text: string): number {
  const canvas = measureTextCanvas || (measureTextCanvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = '16px Times';
  const width = context.measureText(text).width;
  return width;
}

export const Table = ({ table, fields, onSelect }: Props) => {
  const namesByIndex = table.keys;

  // TODO(jaked) Util.memoize
  const onSelectByNameMap = new Map<string, () => void>();
  const onSelectByName = (name: string) => {
    let onSelectForName = onSelectByNameMap.get(name);
    if (!onSelectForName) {
      onSelectForName = () => onSelect(name);
      onSelectByNameMap.set(name, onSelectForName);
    }
    return onSelectForName;
  }

  const widths = fields.map(_ => 0);
  table.values().forEach(v => {
    fields.forEach((f, i) => {
      widths[i] = Math.max(widths[i], measureText(f.accessor(v as object)));
    });
  });

  return (
    <AutoSizer>
      {({ height, width }) =>
        <VariableSizeGrid
          columnCount={fields.length}
          rowCount={table.size}
          columnWidth={(col) => widths[col] + 14} // 6px padding + 1px margin
          rowHeight={(row) => 30}
          height={height}
          width={width}
        >
          {({ rowIndex, columnIndex, style }) => {
            const name = namesByIndex[rowIndex] ?? bug(`expected name for ${rowIndex}`)
            const object = table.get(name) ?? bug(`expected object for ${name}`);
            const field = fields[columnIndex];
            const value = field.accessor(object.get() as object);
            const Component = field.component;
            const borderTopWidth = rowIndex === 0 ? 1 : 0;
            const borderLeftWidth = columnIndex === 0 ? 1 : 0;

            return (
              <Box
                style={style}
                borderTopWidth={borderTopWidth}
                borderLeftWidth={borderLeftWidth}
                onClick={onSelectByName(name)}
              >
                <Component data={value} />
              </Box>
            );
          }}
        </VariableSizeGrid>
      }
    </AutoSizer>
  );
}
