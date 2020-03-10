import * as Path from 'path';
import * as Immutable from 'immutable';
import * as React from 'react';
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
import { Table, Field as TableField } from '../../components/Table';
import { ModuleValueEnv } from './index';

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
  field: Type.enumerate('tag', 'title', 'created', 'upated')
}));

const tableFieldType = Type.union(tableFieldDataType, tableFieldMetaType);

const tableType =
  Type.object({
    fields: Type.array(tableFieldType)
  });

export default function compileTable(
  trace: Trace,
  ast: ESTree.Expression,
  noteTag: string,
  imports: Immutable.Set<string>,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: ModuleValueEnv,
  setSelected: (tag: string) => void,
): data.Compiled {
  // TODO(jaked)
  // this blows up when there's a type error in config
  // could we admit partial failure here?
  const astAnnotations = new Map<unknown, Try<Type>>();
  let problems = false;
  Typecheck.check(ast, Typecheck.env(), tableType, astAnnotations);

  // TODO(jaked)
  // blows up if a type string cannot be parsed
  // but we don't annotate the expression to indicate the problem
  // tricky since we have discarded the AST already
  // maybe we could evaluate with respect to a type
  // and do conversion internally to evaluation
  const tableConfig: data.Table = {
    fields: Evaluate.evaluateExpression(ast, Immutable.Map()).fields.map(field => {
      switch (field.kind) {
        case 'data':
          const type = Parse.parseType(field.type);
          field = { ...field, type }
      }
      return field;
    })
  };

  const tableDataFields: { field: string, type: Type }[] = [];
  tableConfig.fields.forEach(field => {
    if (field.kind === 'data') {
      tableDataFields.push({ field: field.name, type: field.type });
    }
  });
  const tableDataType = Type.object(tableDataFields);

  const types: Type[] = [];
  imports.forEach(tag => {
    // TODO(jaked) surface these errors somehow
    // also surface underlying errors
    // e.g. a module doesn't match its type signature
    const moduleType = moduleTypeEnv.get(tag);
    if (!moduleType) {
      console.log(`expected module type for ${tag}`);
      return;
    }
    const defaultType = moduleType.get('default');
    if (!defaultType) {
      console.log(`expected default export for ${tag}`);
      return;
    }
    types.push(defaultType);
  });
  const typeUnion = Type.union(...types);

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
  if (!Type.equiv(objectType, tableDataType))
    throw new Error('table config type and record data type must be the same');

  // TODO(jaked)
  // treat imports as a Signal<Map> to make tables incremental
  const table = Signal.ok(Immutable.Map<string, Signal<any>>().withMutations(map =>
    imports.forEach(tag => {
      const moduleValue = moduleValueEnv.get(tag);
      if (!moduleValue) {
        console.log(`expected module value for ${tag}`);
        return;
      }
      const defaultValue = moduleValue['default'];
      if (!defaultValue) {
        console.log(`expected default member for ${tag}`);
        return;
      }
      const relativeTag = Path.relative(Path.dirname(noteTag), tag);
      map.set(relativeTag, defaultValue)
    })
  ));

  const exportType = Type.module({
    default: Type.map(Type.string, objectType)
  });
  const exportValue = {
    default: Signal.joinImmutableMap(table)
  }

  const fields: TableField[] =
    objectType.fields.map(({ field, type }) => ({
      label: field,
      accessor: (o: object) => o[field],
      width: 100,
      component: ({ data }) => React.createElement(React.Fragment, null, String(data))
    }));
  const onSelect = (tag: string) =>
    setSelected(Path.join(Path.dirname(noteTag), tag));
  const rendered = exportValue.default.map(data => {
    return React.createElement(Table, { data, fields, onSelect })
  });
  return { exportType, exportValue, rendered, astAnnotations, problems };
}
