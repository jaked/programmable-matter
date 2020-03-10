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

function computeTableConfig(
  ast: ESTree.Expression
) {
  // TODO(jaked)
  // this blows up when there's a type error in config
  // could we admit partial failure here?
  const astAnnotations = new Map<unknown, Try<Type>>();
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

  return { tableConfig, astAnnotations };
}

function computeObjectType(
  imports: Immutable.Set<string>,
  noteEnv: Immutable.Map<string, data.CompiledNote>,
) {
  const typeUnion = Signal.join(...imports.toArray().map(tag => {
    // TODO(jaked) handle partial failures better here
    const note = noteEnv.get(tag) ?? bug(`expected note for ${tag}`);
    return note.exportType.map(exportType =>
      exportType.get('default') ?? bug(`expected default export for ${tag}`)
    );
  })).map(types => Type.union(...types));

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

export default function compileTable(
  trace: Trace,
  ast: ESTree.Expression,
  noteTag: string,
  imports: Immutable.Set<string>,
  noteEnv: Immutable.Map<string, data.CompiledNote>,
  setSelected: (tag: string) => void,
): Signal<data.Compiled> {
  const { tableConfig, astAnnotations } = computeTableConfig(ast);

  const tableDataFields: { field: string, type: Type }[] = [];
  tableConfig.fields.forEach(field => {
    if (field.kind === 'data') {
      tableDataFields.push({ field: field.name, type: field.type });
    }
  });
  const tableDataType = Type.object(tableDataFields);

  const objectType = computeObjectType(imports, noteEnv);

  return objectType.map(objectType => {
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

    const table = Immutable.Map<string, Signal<any>>().withMutations(map =>
      imports.forEach(tag => {
        // TODO(jaked) handle partial failures better here
        const note = noteEnv.get(tag) ?? bug(`expected note for ${tag}`);
        const defaultValue =
          note.exportValue.flatMap(exportValue => exportValue['default']);
        const relativeTag = Path.relative(Path.dirname(noteTag), tag);
        map.set(relativeTag, defaultValue)
      })
    );

    const exportType = Type.module({
      default: Type.map(Type.string, objectType)
    });
    const exportValue = {
      default: Signal.joinImmutableMap(Signal.ok(table))
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
    return { exportType, exportValue, rendered, astAnnotations, problems: false };
  });
}
