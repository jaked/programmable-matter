import * as Immutable from 'immutable';
import JSON5 from 'json5';
import * as React from 'react';
import styled from 'styled-components';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';
import { Record, Field as RecordField } from '../../components/Record';
import lensType from './lensType';
import lensValue from './lensValue';

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
  height: '100%',
});

function fieldComponent(field: string, type: Type) {
  switch (type.kind) {
    case 'string':
      return ({ lens }) =>
        React.createElement(Input, {
          type: 'text',
          value: lens(),
          onChange: (e: React.FormEvent<HTMLInputElement>) => lens(e.currentTarget.value)
        });

    case 'boolean':
      return ({ lens }) =>
        React.createElement(Input, {
          type: 'checkbox',
          checked: lens(),
          onChange: (e: React.FormEvent<HTMLInputElement>) => lens(e.currentTarget.checked)
        });

    case 'number':
      return ({ lens }) =>
        React.createElement(Input, {
          type: 'text',
          value: String(lens()),
          onChange: (e: React.FormEvent<HTMLInputElement>) => lens(Number(e.currentTarget.value))
        });

    case 'Union':
      // TODO(jaked) support non-required select if `undefined` in union
      if (type.types.some(type => type.kind !== 'Singleton' || type.base.kind !== 'string'))
        bug(`unhandled type ${type.kind} in fieldComponent`);
      return ({ lens }) =>
        React.createElement(
          'select',
          {
            required: true,
            value: lens(),
            onChange: (e: React.FormEvent<HTMLInputElement>) => lens(e.currentTarget.value)
          },
          ...type.types.map(type => {
            if (type.kind !== 'Singleton' || type.base.kind !== 'string')
              bug(`unhandled type ${type.kind} in fieldComponent`);
            return React.createElement('option', { value: type.value }, type.value);
          })
        );

    default:
      bug(`unhandled type ${type.kind} in fieldComponent`);
  }
}

export default function compileJson(
  file: Signal<data.File>,
  ast: Signal<ESTree.Expression>,
  meta: Signal<data.Meta>,
  updateFile: (path: string, buffer: Buffer) => void
): Signal<data.Compiled> {
  const typeAstAnnotations =
    Signal.join(ast, meta).map(([ast, meta]) => {
      const astAnnotations = new Map<unknown, Try<Type>>();
      try {
        if (meta.dataType) {
          Typecheck.check(ast, Typecheck.env(), meta.dataType, astAnnotations);
          return { type: meta.dataType, astAnnotations };
        } else {
          return { type: Typecheck.synth(ast, Typecheck.env(), astAnnotations), astAnnotations };
        }
      } catch (e) {
        return { type: Type.never, astAnnotations };
      }
    });

  const type = typeAstAnnotations.map(({ type }) => type);

  // stage the evaluation of Record
  // so we only build a new function component when type changes
  // so we only remount the React subtree when type changes
  // so we don't lose input focus on every edit
  const record = type.map(type => {
    // TODO(jaked) handle other JSON types
    if (type.kind !== 'Object') bug(`expected Object type`);

    const fields = type.fields.map(({ field, type }) => ({
      label: field,
      accessor: (o: object) => o[field],
      component: fieldComponent(field, type)
    }));
    return Record(fields);
  });

  return Signal.join(
    file,
    ast,
    typeAstAnnotations,
    record
  ).map(([file, ast, { type, astAnnotations }, record]) => {
    if (type.kind === 'never') {
      const exportType = Type.module({ });
      const exportValue = { };
      const rendered = Signal.ok(false);
      return { exportType, exportValue, rendered, astAnnotations, problems: true };
    }

    const exportType = Type.module({
      default: type,
      mutable: lensType(type),
    });
    const value = Evaluate.evaluateExpression(ast, Immutable.Map());
    const setValue = (v) => updateFile(file.path, Buffer.from(JSON5.stringify(v, undefined, 2), 'utf-8'));
    const lens = lensValue(value, setValue, type);
    const exportValue = {
      default: Signal.ok(value),
      mutable: Signal.ok(lens)
    };

    const rendered = Signal.ok(
      // TODO(json) handle arrays of records (with Table)
      React.createElement(record, { object: lens })
    );
    return { exportType, exportValue, rendered, astAnnotations, problems: false };
  })
}
