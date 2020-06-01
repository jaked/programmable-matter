import * as Path from 'path';
import * as Immutable from 'immutable';
import JSON5 from 'json5';
import * as React from 'react';
import { Tuple2 } from '../../util/Tuple';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import * as Tag from '../../util/Tag';
import { diffMap } from '../../util/immutable/Map';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';
import { Table, Field as TableField } from '../../components/Table';
import lensType from './lensType';

// see Typescript-level types in data.ts
// TODO(jaked)
// this way of writing the type produces obscure error messages, e.g.
//   expected { name: string, label: string } & { kind: 'data', type: string } | { name: string, label: string } & { kind: 'meta', field: 'tag' | 'title' | 'created' | 'upated' }, got {  }
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
  field: Type.enumerate('tag', 'title', 'created', 'updated')
}));

const tableFieldType = Type.union(tableFieldDataType, tableFieldMetaType);

const tableType =
  Type.object({
    fields: Type.array(tableFieldType)
  });

function computeTableConfig(
  ast: ESTree.Expression,
  annots: Map<unknown, Try<Type>>,
): data.Table {
  Typecheck.check(ast, Typecheck.env(), tableType, annots);

  // TODO(jaked)
  // blows up if a type string cannot be parsed
  // but we don't annotate the expression to indicate the problem
  // tricky since we have discarded the AST already
  // maybe we could evaluate with respect to a type
  // and do conversion internally to evaluation
  return {
    fields: Evaluate.evaluateExpression(ast, Immutable.Map()).fields.map(field => {
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
  tableConfig: data.Table
): Type.ObjectType {
  const tableDataFields: Tuple2<string, Type>[] = [];
  tableConfig.fields.forEach(field => {
    if (field.kind === 'data') {
      tableDataFields.push(Tuple2(field.name, field.type));
    }
  });
  return Type.object(tableDataFields);
}

function computeTable(
  tableConfig: data.Table,
  tableDataType: Type.ObjectType,
  noteTag: string,
  noteEnv: Immutable.Map<string, data.CompiledNote>,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
) {
  return Signal.joinImmutableMap(Signal.ok(
    Immutable.Map<string, Signal<any>>().withMutations(map =>
      noteEnv.forEach((note, tag) => {
        // TODO(jaked) handle partial failures better here

        const defaultType = note.exportType.map(exportType => {
          const defaultType = exportType.getFieldType('default') ?? bug(`expected type for default field`);
          // TODO(jaked)
          // check data files directly against table config
          // instead of checking after the fact
          // that their types agree with the table config type
          if (!Type.isSubtype(defaultType, tableDataType))
            throw new Error('record data type must match table config type');
          return defaultType;
        });

        const mutableValue =
          note.exportValue.flatMap(exportValue => exportValue['mutable']);

        const metaValue = note.meta.map(meta =>
          tableConfig.fields.reduce<object>(
            (obj, field) => {
              if (field.kind === 'meta') {
                switch (field.field) {
                  case 'title': return { obj, [field.name]: meta.title }
                }
              }
              return obj;
            },
            {}
          ),
        );

        const value = Signal.join(defaultType, mutableValue, metaValue).map(([defaultType, mutableValue, metaValue]) => {
          // TODO(jaked) merge mutable data members and immutable meta members
          // TODO(jaked) could some meta members be mutable?
          return mutableValue;
        });
        const relativeTag = Path.relative(noteTag, tag);
        map.set(relativeTag, value);
      })
    )
  )).map<any>(lensTable => {
    const table = lensTable.map(v => v());

    const f = function(...v: any[]) {
      switch (v.length) {
        case 0: return table;

        case 1: {
          const table2 = v[0];
          const { added, changed, deleted } = diffMap(table, table2);
          added.forEach((value, key) => {
            const path = Path.join(noteTag, key) + '.json';
            updateFile(path, Buffer.from(JSON5.stringify(value, undefined, 2)));
          });
          changed.forEach(([prev, curr], key) => {
            const lens = lensTable.get(key) ?? bug(`expected lens for ${key}`);
            lens(curr);
          });
          deleted.forEach(key => {
            // TODO(jaked) delete multi-part notes
            const path = Path.join(noteTag, key) + '.json';
            deleteFile(path);
          });
          return;
        }

        default: bug(`expected 0- or 1-arg invocation`);
      }
    }

    return new Proxy(f, { get: (target, key, receiver) => {
      switch (key) {
        case 'size': return lensTable.size;
        case 'set': return (key, value) => lensTable.set(key, value);
        case 'delete': return (key) => lensTable.delete(key);
        case 'clear': return () => lensTable.clear();
        case 'filter': return (fn) => lensTable.filter(fn);
        case 'toList': return () => lensTable.toList();
        case 'update': return (key, fn) => lensTable.update(key, fn);
        case 'get': return (key, nsv) => lensTable.get(key, nsv);

        default: return undefined;
      }
    }});
  });
}

function computeFields(
  tableConfig: data.Table,
) {
  return tableConfig.fields.map(field => {
    return {
      label: field.label,
      accessor: (o: object) => o[field.name](),
      width: 100,
      component: ({ data }) => React.createElement(React.Fragment, null, String(data))
    };
  });
}

function compileTable(
  trace: Trace,
  ast: ESTree.Expression,
  noteTag: string,
  noteEnv: Immutable.Map<string, data.CompiledNote>,
  setSelected: (tag: string) => void,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
): data.Compiled {
  const astAnnotations = new Map<unknown, Try<Type>>();
  let problems = false;
  let tableConfig: data.Table;
  try {
    tableConfig = computeTableConfig(ast, astAnnotations);
  } catch (e) {
    console.log(e);
    return {
      exportType: Type.module({ }),
      exportValue: { },
      rendered: Signal.ok(false),
      astAnnotations,
      problems: true,
    };
  }

  const tableDataType = computeTableDataType(tableConfig);

  const table = computeTable(tableConfig, tableDataType, noteTag, noteEnv, updateFile, deleteFile);

  const fields = computeFields(tableConfig);

  const exportType = Type.module({
    // TODO(jaked) should include non-data table fields
    default: lensType(Type.map(Type.string, tableDataType))
  });
  const exportValue = {
    default: table
  }

  const onSelect = (tag: string) =>
    setSelected(Path.join(Path.dirname(noteTag), tag));
  const rendered = table.map(table =>
    React.createElement(Table, { data: table(), fields, onSelect })
  );
  return { exportType, exportValue, rendered, astAnnotations, problems };
}

export default function compileFileTable(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  compiledNotes: Signal<data.CompiledNotes>,
  setSelected: (tag: string) => void,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
): Signal<data.CompiledFile> {

  const noteTag = Tag.tagOfPath(file.path);

  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support non-index foo.table
  // TODO(jaked) Signal.filter
  const noteEnv = Signal.mapWithPrev<data.CompiledNotes, data.CompiledNotes>(
    compiledNotes,
    (compiledNotes, prevCompiledNotes, prevNoteEnv) => {
      return prevNoteEnv.withMutations(noteEnv => {
        const dir = Path.parse(file.path).dir;
        const { added, changed, deleted } = diffMap(prevCompiledNotes, compiledNotes);
        added.forEach((compiledNote, tag) => {
          // TODO(jaked) not sure if we should handle nested dirs in tables
          // TODO(jaked) handle non-json files
          if (tag !== dir && !Path.relative(dir, tag).startsWith('..'))
            noteEnv.set(tag, compiledNote);
        });
        changed.forEach(([prev, curr], tag) => noteEnv.set(tag, curr));
        deleted.forEach(tag => noteEnv.delete(tag));
      });
    },
    Immutable.Map(),
    Immutable.Map()
  );

  return ast.liftToTry().flatMap(astTry => {
    const astTryOrig = astTry;
    switch (astTry.type) {
      case 'ok':
        return noteEnv.map(noteEnv => {
          const compiled = compileTable(trace, astTry.ok, noteTag, noteEnv, setSelected, updateFile, deleteFile);
          return { ...compiled, ast: astTryOrig };
        });

      case 'err': {
        return Signal.ok({
          exportType: Type.module({}),
          exportValue: {},
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTryOrig
        })
      }
    }
  });
}
