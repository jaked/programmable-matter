import * as Path from 'path';
import * as Immutable from 'immutable';
import * as React from 'react';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as data from '../../data';
import { Table, Field as TableField } from '../../components/Table';
import { ModuleValueEnv } from './index';

export default function compileTable(
  trace: Trace,
  noteTag: string,
  imports: Immutable.Set<string>,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: ModuleValueEnv,
  setSelected: (tag: string) => void,
): data.Compiled {
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
      component: ({ data }) => React.createElement(React.Fragment, null, data)
    }));
  const onSelect = (tag: string) =>
    setSelected(Path.join(Path.dirname(noteTag), tag));
  const rendered = exportValue.default.map(data => {
    return React.createElement(Table, { data, fields, onSelect })
  });
  return { exportType, exportValue, rendered };
}
