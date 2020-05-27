import * as Path from 'path';
import * as Immutable from 'immutable';
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

function computeObjectType(
  noteEnv: Immutable.Map<string, data.CompiledNote>,
): Signal<Type.ObjectType> {
  const typeUnion = Signal.join(...noteEnv.map((note, tag) => {
    // TODO(jaked) handle partial failures better here
    return note.exportType.map(exportType =>
      exportType.getFieldType('default') ?? bug(`expected default export for ${tag}`)
    );
  }).values()).map(types => Type.union(...types));

  return typeUnion.map(typeUnion => {
    let objectType: Type.ObjectType | undefined = undefined;
    switch (typeUnion.kind) {
      case 'Object':
        objectType = typeUnion;
        break;

      case 'Intersection':
        // TODO(jaked) tighten up
        typeUnion.types.filter(type => type.kind === 'Object').forEach(type => {
          if (type.kind !== 'Object') bug(`expected Object type, got ${type.kind}`);
          objectType = type;
        });
        break;

      default:
        // TODO(jaked)
        // maybe we can display nonuniform / non-Object types a different way?
        bug(`unhandled table value type ${typeUnion.kind}`)
    }
    if (!objectType) bug(`expected objectType to be set`);
    return objectType;
  });
}

function computeTable(
  tableConfig: data.Table,
  noteTag: string,
  noteEnv: Immutable.Map<string, data.CompiledNote>,
) {
  return Signal.joinImmutableMap(Signal.ok(
    Immutable.Map<string, Signal<any>>().withMutations(map =>
      noteEnv.forEach((note, tag) => {
        // TODO(jaked) handle partial failures better here
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

        const value = mutableValue;
        // TODO(jaked) merge mutable data members and immutable meta members
        // TODO(jaked) could some meta members be mutable?
        // const value = Signal.join(mutableValue, metaValue).map(([defaultValue, metaValue]) => ({ ...defaultValue, ...metaValue }));
        const relativeTag = Path.relative(noteTag, tag);
        map.set(relativeTag, value);
      })
    )
  )).map<any>(table => {
    const f = function(...v: any[]) {
      switch (v.length) {
        case 0: return table;

        case 1: {
          const table2 = v[0];
          const { added, changed, deleted } = diffMap(table, table2);
          added.forEach((value, key) => bug(`unimplemented`));
          changed.forEach(([prev, curr], key) => {
            const lens = table.get(key) ?? bug(`expected lens for ${key}`);
            lens(curr);
          });
          deleted.forEach(key => bug(`unimplemented`));
          return;
        }

        default: bug(`expected 0- or 1-arg invocation`);
      }
    }

    return new Proxy(f, { get: (target, key, receiver) => {
      switch (key) {
        case 'size': return table.size;
        case 'set': return (key, value) => table.set(key, value);
        case 'delete': return (key) => table.delete(key);
        case 'clear': return () => table.clear();
        case 'filter': return (fn) => table.filter(fn);
        case 'toList': return () => table.toList();
        case 'get': return (key, nsv) => table.get(key, nsv);

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
): Signal<data.Compiled> {
  const objectType = computeObjectType(noteEnv);

  const astAnnotations = new Map<unknown, Try<Type>>();
  let problems = false;
  let tableConfig: Signal<data.Table>;
  try {
    tableConfig = Signal.ok(computeTableConfig(ast, astAnnotations));
  } catch (e) {
    problems = true;
    tableConfig = objectType.map(objectType => ({
      fields: objectType.fields.map<data.TableField>(({ _1: name, _2: type }) => ({
        name,
        label: name,
        kind: 'data',
        type,
      })).toArray()
    }));
  }

  const table = tableConfig.flatMap(tableConfig => computeTable(tableConfig, noteTag, noteEnv));

  return Signal.join(objectType, tableConfig).map(([objectType, tableConfig]) => {
    // TODO(jaked)
    // we derive a type from the fields in the table description
    // and also from the data files in the directory
    // then check that they agree
    // it would be better to directly check the data files
    // against the fields in the table description
    // but dependencies make this hairy; we could
    //   - make data files depend on table for type,
    //     and table depend on data files for values; or
    //   - handle table descriptions earlier in compilation
    //     as we do with index.meta
    //   - make dependencies more fine-grained
    //     e.g. per-file instead of per-note, or finer
    //   - ???
    const tableDataFields: Tuple2<string, Type>[] = [];
    tableConfig.fields.forEach(field => {
      if (field.kind === 'data') {
        tableDataFields.push(Tuple2(field.name, field.type));
      }
    });
    const tableDataType = Type.object(tableDataFields);
      if (!Type.equiv(objectType, tableDataType))
      throw new Error('table config type and record data type must be the same');
    const fields = computeFields(tableConfig);

    const exportType = Type.module({
      // TODO(jaked) should include non-data table fields
      default: lensType(Type.map(Type.string, objectType))
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

  // TODO(jaked) Signal#handle
  }).liftToTry().map(tryCompiled => {
    switch (tryCompiled.type) {
      case 'ok': return tryCompiled.ok;
      case 'err': return {
        exportType: Type.module({ }),
        exportValue: { },
        rendered: Signal.constant(tryCompiled),
        astAnnotations,
        problems: true,
      }
    }
  })
}

export default function compileFileTable(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  compiledNotes: Signal<data.CompiledNotes>,
  setSelected: (tag: string) => void,
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
        // TODO(jaked) fall back to object type if parse fails
        return noteEnv.flatMap(noteEnv =>
          compileTable(trace, astTry.ok, noteTag, noteEnv, setSelected)
            .map(compiled => ({ ...compiled, ast: astTryOrig }))
        );

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
