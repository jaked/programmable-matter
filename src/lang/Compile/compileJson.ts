import * as Immutable from 'immutable';
import * as React from 'react';
import Signal from '../../util/Signal';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';
import { Record, Field as RecordField } from '../../components/Record';
import lensType from './lensType';
import lensValue from './lensValue';

function fieldComponent(field: string, type: Type) {
  switch (type.kind) {
    default:
      return ({ lens }) =>
        React.createElement('input', {
          style: {
            width: '100%',
            height: '100%',
            border: 'none',
          },
          type: 'text',
          value: lens(),
          onChange: (e: React.FormEvent<HTMLInputElement>) => lens(e.currentTarget.value)
        });
  }
}

export default function compileJson(
  ast: ESTree.Expression,
  meta: data.Meta,
  updateFile: (obj: any) => void
): data.Compiled {
  let type: Type;
  if (meta.dataType) {
    Typecheck.check(ast, Typecheck.env(), meta.dataType);
    type = meta.dataType;
  } else {
    type = Typecheck.synth(ast, Typecheck.env());
  }
  // TODO(jaked) handle other JSON types
  if (type.kind !== 'Object') bug(`expected Object type`);

  const exportType = Type.module({
    default: type,
    mutable: lensType(type),
  });
  const value = Evaluate.evaluateExpression(ast, Immutable.Map());
  const setValue = (v) => { updateFile(v) };
  const lens = lensValue(value, setValue, type);
  const exportValue = {
    default: Signal.ok(value),
    mutable: Signal.ok(lens)
  };
  const fields: RecordField[] =
    type.fields.map(({ field, type }) => ({
      label: field,
      accessor: (o: object) => o[field],
      component: fieldComponent(field, type)
    }));
  const rendered = Signal.ok(
    // TODO(json) handle arrays of records (with Table)
    React.createElement(Record, { object: lens, fields })
  );
  return { exportType, exportValue, rendered };
}
