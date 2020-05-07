import * as Immutable from 'immutable';
import JSON5 from 'json5';
import * as React from 'react';
import styled from 'styled-components';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';
import { Record } from '../../components/Record';
import lensType from './lensType';
import lensValue from './lensValue';

import metaForPath from './metaForPath';

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
  height: '100%',
});

const stringInputComponent = ({ lens }) =>
  React.createElement(Input, {
    type: 'text',
    value: lens(),
    onChange: (e: React.FormEvent<HTMLInputElement>) => lens(e.currentTarget.value)
  });

const booleanInputComponent = ({ lens }) =>
  React.createElement(Input, {
    type: 'checkbox',
    checked: lens(),
    onChange: (e: React.FormEvent<HTMLInputElement>) => lens(e.currentTarget.checked)
  });

const numberInputComponent = ({ lens }) =>
  React.createElement(Input, {
    type: 'text',
    value: String(lens()),
    onChange: (e: React.FormEvent<HTMLInputElement>) => lens(Number(e.currentTarget.value))
  });

function fieldComponent(field: string, type: Type) {
  switch (type.kind) {
    case 'string': return stringInputComponent;
    case 'boolean': return booleanInputComponent;
    case 'number': return numberInputComponent;

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

function compileJson(
  file: data.File,
  ast: ESTree.Expression,
  meta: data.Meta,
  updateFile: (path: string, buffer: Buffer) => void
): data.Compiled {
  const astAnnotations = new Map<unknown, Try<Type>>();
  let type: Type;
  try {
    if (meta.dataType) {
      Typecheck.check(ast, Typecheck.env(), meta.dataType, astAnnotations);
      type = meta.dataType;
    } else {
      type = Typecheck.synth(ast, Typecheck.env(), astAnnotations);
    }
  } catch (e) {
    const exportType = Type.module({ });
    const exportValue = { };
    const rendered = Signal.ok(false);
    return { exportType, exportValue, rendered, astAnnotations, problems: true };
  }

  // TODO(jaked) handle other JSON types
  if (type.kind !== 'Object') bug(`expected Object type`);
  const typeObject = type;

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

  const rendered = Signal.constant(Try.apply(() => {
    const fields = typeObject.fields.map(({ _1: name, _2: type }) => ({
      label: name,
      accessor: (o: object) => o[name],
      component: fieldComponent(name, type)
    }));

    // TODO(json) handle arrays of records (with Table)
    return React.createElement(Record, { object: lens, fields: fields.toArray() })
  }));
  return { exportType, exportValue, rendered, astAnnotations, problems: false };
}

export default function compileFileJson(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  updateFile: (path: string, buffer: Buffer) => void,
): Signal<data.CompiledFile> {
  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support typechecking from index.table file

  const meta = metaForPath(file.path, compiledFiles);

  return ast.liftToTry().flatMap(astTry => {
    const astTryOrig = astTry;
    switch (astTry.type) {
      case 'ok':
        return meta.map(meta => {
          const compiled = compileJson(file, astTry.ok, meta, updateFile);
          return { ...compiled, ast: astTryOrig };
        });

      case 'err':
        return Signal.ok({
          exportType: Type.module({}),
          exportValue: {},
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTryOrig
        });
    }
  });
}
