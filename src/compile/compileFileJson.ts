import * as Immutable from 'immutable';
import JSON5 from 'json5';
import * as React from 'react';
import styled from 'styled-components';
import Signal from '../util/Signal';
import Try from '../util/Try';
import { bug } from '../util/bug';
import * as Parse from '../parse';
import Type from '../type';
import Typecheck from '../typecheck';
import * as Evaluate from '../evaluate';
import { InterfaceMap, Content, CompiledFile } from '../model';
import { Record } from '../components/Record';

import metaForPath from './metaForPath';

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
  height: '100%',
});

const stringInputComponent = ({ cell }: { cell: Signal.Writable<unknown> }) =>
  React.createElement(Input, {
    type: 'text',
    value: cell.get(),
    onChange: (e: React.FormEvent<HTMLInputElement>) => cell.setOk(e.currentTarget.value)
  });

const booleanInputComponent = ({ cell }: { cell: Signal.Writable<unknown> }) =>
  React.createElement(Input, {
    type: 'checkbox',
    checked: cell.get(),
    onChange: (e: React.FormEvent<HTMLInputElement>) => cell.setOk(e.currentTarget.checked)
  });

const numberInputComponent = ({ cell }: { cell: Signal.Writable<unknown> }) =>
  React.createElement(Input, {
    type: 'text',
    value: String(cell.get()),
    onChange: (e: React.FormEvent<HTMLInputElement>) => cell.setOk(Number(e.currentTarget.value))
  });

function fieldComponent(field: string, type: Type) {
  switch (type.kind) {
    case 'string': return stringInputComponent;
    case 'boolean': return booleanInputComponent;
    case 'number': return numberInputComponent;

    case 'Union':
      // TODO(jaked) support non-required select if `undefined` in union
      if (type.types.some(type => type.kind !== 'Singleton' || type.base.kind !== 'string'))
        bug(`unhandled type ${Type.toString(type)} in fieldComponent`);
      return ({ cell }: { cell: Signal.Writable<unknown> }) =>
        React.createElement(
          'select',
          {
            required: true,
            value: cell.get(),
            onChange: (e: React.FormEvent<HTMLInputElement>) => cell.setOk(e.currentTarget.value)
          },
          ...type.types.map(type => {
            if (type.kind !== 'Singleton' || type.base.kind !== 'string')
              bug(`unhandled type ${Type.toString(type)} in fieldComponent`);
            return React.createElement('option', { value: type.value }, type.value);
          })
        );

    default:
      bug(`unhandled type ${Type.toString(type)} in fieldComponent`);
  }
}

export default function compileFileJson(
  file: Content,
  compiledFiles: Signal<Map<string, CompiledFile>> = Signal.ok(new Map()),
  updateFile: (path: string, buffer: Buffer) => void = (path: string, buffer: Buffer) => { },
): CompiledFile {
  const ast = file.content.map(content => Parse.parseExpression(content as string));

  // TODO(jaked) support typechecking from index.table file

  const meta = metaForPath(file.path, compiledFiles);

  const compiled = Signal.join(ast, meta).map(([ast, meta]) => {
    const interfaceMap: InterfaceMap = new Map();
    const intf =
      meta.dataType ?
        Typecheck.check(ast, Typecheck.env(), meta.dataType, interfaceMap) :
        Typecheck.synth(ast, Typecheck.env(), interfaceMap);
    const problems = [...interfaceMap.values()].some(intf => intf.type === 'err');

    if (intf.type === 'err') {
      // TODO(jaked) these should be Signal.err
      const exportInterface = new Map([
        [ 'default', intf ],
      ]);
      const exportValue = new Map([
        [ 'default', intf.err ],
      ]);
      const rendered = Signal.ok(null);
      return {
        exportInterface,
        exportValue,
        rendered,
        interfaceMap,
        problems,
      }
    } else {
      const type = meta.dataType ? meta.dataType : intf.ok.type;

      const exportInterface = new Map([
        [ 'default', Try.ok({ type, dynamic: false, mutable: 'Code' as const }) ],
      ]);
      const value = Evaluate.evaluateExpression(ast, interfaceMap, Immutable.Map());
      // TODO(jaked) this is an abuse of mapInvertible, maybe add a way to make Signals from arbitrary functions?
      const cell = Signal.cellOk(undefined).mapInvertible(
        _ => value,
        v => updateFile(file.path, Buffer.from(JSON5.stringify(v, undefined, 2), 'utf-8')) as undefined
      );
      const exportValue = new Map([
        [ 'default', cell ],
      ]);

      const rendered = Signal.constant(Try.apply(() => {
        // TODO(jaked) handle other JSON types
        if (type.kind !== 'Object') return null; // bug(`expected Object type`);
        const typeObject = type;

        // TODO(jaked) error handling here
        const fields = typeObject.fields.map(({ name, type }) => ({
          label: name,
          getter: (o: unknown) => (o as object)[name],
          setter: (o: unknown, v: unknown) => { (o as object)[name] = v },
          component: fieldComponent(name, type)
        }));

        // TODO(json) handle arrays of records (with Table)
        return React.createElement(Record, { cell, fields });
      }));

      return {
        exportInterface,
        exportValue,
        rendered,
        interfaceMap,
        problems: false,
      };
    }
  });

  return {
    ast,
    exportInterface: compiled.map(({ exportInterface }) => exportInterface),
    interfaceMap: compiled.map(({ interfaceMap }) => interfaceMap),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    rendered: compiled.flatMap(({ rendered }) => rendered),
  };
}
