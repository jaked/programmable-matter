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
  const exportValue = {
    default: Signal.ok(value),
    mutable: Signal.ok(lensValue(value, setValue, type))
  };
  const fields: RecordField[] =
    type.fields.map(({ field, type }) => ({
      label: field,
      accessor: (o: object) => o[field],
      component: ({ data }) => React.createElement(React.Fragment, null, data)
    }));
  const rendered = Signal.ok(
    // TODO(json) handle arrays of records (with Table)
    React.createElement(Record, { object: value, fields })
  );
  return { exportType, exportValue, rendered };
}
