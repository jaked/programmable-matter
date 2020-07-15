import * as Immutable from 'immutable';
import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { VariableSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import { bug } from '../util/bug';

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
  data: Immutable.Map<string, object>,
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

export const Table = ({ data, fields, onSelect }: Props) => {
  const namesByIndex = data.keySeq().toIndexedSeq();

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

  const widths = data.reduce(
    (widths, r) =>
      fields.reduce(
        (widths, field, i) => {
          const width = Math.max(widths[i], measureText(field.accessor(r)));
          return { ...widths, [i]: width }
        },
        widths
      ),
    fields.reduce((widths, field, i) => ({ ...widths, [i]: 0 }), {})
  )

  return (
    <AutoSizer>
      {({ height, width }) =>
        <VariableSizeGrid
          columnCount={fields.length}
          rowCount={data.size}
          columnWidth={(col) => widths[col] + 14} // 6px padding + 1px margin
          rowHeight={(row) => 30}
          height={height}
          width={width}
        >
          {({ rowIndex, columnIndex, style }) => {
            const name = namesByIndex.get(rowIndex) || bug(`expected name for ${rowIndex}`)
            const object = data.get(name) || bug(`expected object for ${name}`);
            const field = fields[columnIndex];
            const value = field.accessor(object);
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
