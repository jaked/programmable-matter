import * as Immutable from 'immutable';
import * as Immer from 'immer';
import JSON5 from 'json5';
import * as React from 'react';
import Try from '../../util/Try';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import { diffMap } from '../../util/diffMap';
import { bug } from '../../util/bug';
import * as ESTree from '../../estree';
import * as Parse from '../Parse';
import Type from '../../type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import { Interface, InterfaceMap, Content, CompiledFile, CompiledNote, CompiledNotes } from '../../model';
import * as model from '../../model';
import { Table } from '../../components/Table';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

// see Typescript-level types in data.ts
// TODO(jaked)
// this way of writing the type produces obscure error messages, e.g.
//   expected { name: string, label: string } & { kind: 'data', type: string } | { name: string, label: string } & { kind: 'meta', field: 'name' | 'title' | 'created' | 'upated' }, got {  }
// need to improve checking inside unions / intersections

const tableFieldBaseType = Type.object({
  name: Type.string,
  label: Type.string,
});

const tableFieldDataType = Type.intersection(tableFieldBaseType, Type.object({
  kind: Type.singleton('data'),

  // TODO(jaked)
  // could represent types in JSON
  // or extend JSON syntax / value representation to include types
  type: Type.string,
}));

const tableFieldMetaType = Type.intersection(tableFieldBaseType, Type.object({
  kind: Type.singleton('meta'),
  field: Type.enumerate('name', 'title', 'created', 'updated')
}));

const tableFieldType = Type.union(tableFieldDataType, tableFieldMetaType);

const tableType =
  Type.object({
    fields: Type.array(tableFieldType)
  });

function computeTableConfig(
  ast: ESTree.Expression,
  interfaceMap: InterfaceMap,
): model.Table {
  // TODO(jaked)
  // blows up if a type string cannot be parsed
  // but we don't annotate the expression to indicate the problem
  // tricky since we have discarded the AST already
  // maybe we could evaluate with respect to a type
  // and do conversion internally to evaluation
  return {
    fields: (Evaluate.evaluateExpression(ast, interfaceMap, Immutable.Map()) as any).fields.map(field => {
      switch (field.kind) {
        case 'data':
          const type = Parse.parseType(field.type);
          field = { ...field, type }
      }
      return field;
    })
  };
}

function computeTableDataType(
  tableConfig: model.Table
): Type.ObjectType {
  const tableDataFields: { name: string, type: Type }[] = [];
  tableConfig.fields.forEach(field => {
    if (field.kind === 'data') {
      tableDataFields.push({ name: field.name, type: field.type });
    }
  });
  return Type.object(tableDataFields);
}

function computeTable(
  tableConfig: model.Table,
  tableDataType: Type.ObjectType,
  tableName: string,
  noteEnv: Map<string, CompiledNote>,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
): Signal<model.TableValue<string, unknown>> {
  const cellMap = new Map<string, Signal<Signal.Writable<unknown>>>();
  noteEnv.forEach((note, name) => {
    const cell = Signal.join(
      note.exportInterface, note.exportValue
    ).map(([exportInterface, exportValue]) => {
      const intf = exportInterface.get('default') ?? bug(`expected default interface`);
      // TODO(jaked)
      // check data files directly against table config
      // instead of checking after the fact
      // that their types agree with the table config type
      if (!intf || !Type.isSubtype(intfType(intf), tableDataType))
        throw new Error('record data type must match table config type')
      if (!(intf.type === 'ok' && intf.ok.mutable))
        throw new Error(`expected mutable`)
      // TODO(jaked) should return a Try.err here instead of throwing?
      return (exportValue.get('default') ?? bug(`expected default value`)) as Signal.Writable<unknown>;
    });

    const baseName = Name.relative(Name.dirname(tableName), name);
    cellMap.set(baseName, cell);
  });

  return Signal.joinMap(Signal.ok(cellMap)).map(cellMap => ({
    size: cellMap.size,

    clear: () => bug(`unimplemented`),

    delete: (key: string) => {
      // TODO(jaked) delete multi-part notes
      const path = Name.pathOfName(Name.join(Name.dirname(tableName), key), 'json');
      deleteFile(path);
    },

    get: (key: string) => cellMap.get(key),

    has: (key: string) => cellMap.has(key),

    set: (key: string, value: unknown) => {
      const path = Name.pathOfName(Name.join(Name.dirname(tableName), key), 'json');
      updateFile(path, Buffer.from(JSON5.stringify(value, undefined, 2)));
    },

    keys: () => [...cellMap.keys()],
    values: () => [...cellMap.values()].map(cell => cell.get()),
  }));
}

function computeFields(
  tableConfig: model.Table,
) {
  return tableConfig.fields.map(field => {
    return {
      label: field.label,
      accessor: (o: object) => o[field.name],
      width: 100,
      component: ({ data }) => React.createElement(React.Fragment, null, String(data))
    };
  });
}

export default function compileFileTable(
  file: Content,
  compiledFiles: Signal<Map<string, CompiledFile>> = Signal.ok(new Map()),
  compiledNotes: Signal<CompiledNotes> = Signal.ok(new Map()),
  setSelected: (name: string) => void = (name: string) => { },
  updateFile: (path: string, buffer: Buffer) => void = (path: string, buffer: Buffer) => { },
  deleteFile: (path: string) => void = (path: string) => { },
): CompiledFile {

  const tableName = Name.nameOfPath(file.path);

  const ast = file.content.map(content => Parse.parseExpression(content as string));

  // TODO(jaked) support non-index foo.table
  // TODO(jaked) Signal.filter
  const noteEnv = Signal.mapWithPrev<CompiledNotes, CompiledNotes>(
    compiledNotes,
    (compiledNotes, prevCompiledNotes, prevNoteEnv) => {
      return Immer.produce(prevNoteEnv, (noteEnv: CompiledNotes) => {
        const dir = Name.dirname(tableName);
        const { added, changed, deleted } = diffMap(prevCompiledNotes, compiledNotes);
        added.forEach((compiledNote, name) => {
          if (Name.dirname(name) === dir && name !== tableName)
            noteEnv.set(name, compiledNote);
        });
        changed.forEach(([prev, curr], name) => noteEnv.set(name, curr));
        deleted.forEach(name => noteEnv.delete(name));
      });
    },
    new Map(),
    new Map()
  );

  const compiled = Signal.join(ast, noteEnv).map(([ast, noteEnv]) => {
    const interfaceMap = new Map<ESTree.Node, Interface>();
    const intf = Typecheck.check(ast, Typecheck.env(), tableType, interfaceMap);
    const problems = [...interfaceMap.values()].some(intf => intf.type === 'err');

    if (intf.type === 'err') {
      return {
        // TODO(jaked) these should be Signal.err
        exportInterface: new Map([[ 'default', intf ]]),
        exportValue: Signal.ok(new Map([[ 'default', intf.err ]])),
        rendered: Signal.ok(null),
        interfaceMap,
        problems,
      }
    }
    const tableConfig = computeTableConfig(ast, interfaceMap);
    const tableDataType = computeTableDataType(tableConfig);

    const table = computeTable(tableConfig, tableDataType, tableName, noteEnv, updateFile, deleteFile);

    const fields = computeFields(tableConfig);

    const exportInterface = new Map<string, Interface>([
      ['default', Try.ok({ type: Type.map(Type.string, tableDataType), dynamic: false, /* mutable: 'Code' */ })]
    ]);
    const exportValue = table.map(table =>
      // weirdly, without cast TS doesn't deduce
      //   Signal<Map<string, Error>> | Signal<Map<string, object>> <: Signal<Map<string, unknown>>
      new Map([[ 'default', table as unknown ]])
    );

    const onSelect = (name: string) => setSelected(Name.join(Name.dirname(tableName), name));

    const rendered = table.map(table =>
      React.createElement(Table, { table, fields, onSelect })
    );
    return {
      exportInterface,
      exportValue,
      rendered,
      interfaceMap,
      problems,
    };
  });

  return {
    ast,
    exportInterface: compiled.map(({ exportInterface }) => exportInterface),
    interfaceMap: compiled.map(({ interfaceMap }) => interfaceMap),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.flatMap(({ exportValue }) => exportValue),
    rendered: compiled.flatMap(({ rendered }) => rendered),
  };
}
