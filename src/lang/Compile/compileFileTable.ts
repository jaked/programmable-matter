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

function computeTable(
  tableConfig: data.Table,
  noteTag: string,
  imports: Immutable.Set<string>,
  noteEnv: Immutable.Map<string, data.CompiledNote>,
) {
  return Signal.joinImmutableMap(Signal.ok(
    Immutable.Map<string, Signal<any>>().withMutations(map =>
      imports.forEach(tag => {
        // TODO(jaked) handle partial failures better here
        const note = noteEnv.get(tag) ?? bug(`expected note for ${tag}`);
        const defaultValue =
          note.exportValue.flatMap(exportValue => exportValue['default']);

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

        const value = Signal.join(defaultValue, metaValue).map(([defaultValue, metaValue]) => ({ ...defaultValue, ...metaValue }));
        const relativeTag = Path.relative(Path.dirname(noteTag), tag);
        map.set(relativeTag, value);
      })
    )
  ));
}

function computeFields(
  tableConfig: data.Table
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

function compileTable(
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

  const table = computeTable(tableConfig, noteTag, imports, noteEnv);

  const fields = computeFields(tableConfig);

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

    const exportType = Type.module({
      default: Type.map(Type.string, objectType)
    });
    const exportValue = {
      default: table
    }

    const onSelect = (tag: string) =>
      setSelected(Path.join(Path.dirname(noteTag), tag));
    const rendered = table.map(data => {
      return React.createElement(Table, { data, fields, onSelect })
    });
    return { exportType, exportValue, rendered, astAnnotations, problems: false };
  });
}

// TODO(jaked) method on File?
function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir;
  else return Path.join(pathParts.dir, pathParts.name);
}

const unimplementedSignal = Signal.err(new Error('unimplemented'));

export default function compileFileTable(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  setSelected: (tag: string) => void,
): Signal<data.CompiledFile> {

  const noteTag = tagOfPath(file.path);

  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support non-index foo.table
  const importsNoteEnv: Signal<[
    Immutable.Set<string>,
    Immutable.Map<string, Signal<data.CompiledNote>>
  ]> = compiledFiles.map(compiledFiles => {
    const importsSet = Immutable.Set<string>().asMutable();
    const noteEnv = Immutable.Map<string, Signal<data.CompiledNote>>().asMutable();
    const dir = Path.parse(file.path).dir;
    compiledFiles.forEach((compiledFile, path) => {
      // TODO(jaked) not sure if we should handle nested dirs in tables
      // TODO(jaked) handle non-json files
      if (!Path.relative(dir, path).startsWith('..') && Path.extname(path) === '.json') {
        const tag = tagOfPath(path);
        importsSet.add(tag);

        // TODO(jaked)
        // since compileNotes expectes a CompiledNote environment
        // we need to fake one up for now.
        noteEnv.set(tag, compiledFile.map(compiledFile => ({
          tag,
          isIndex: false,
          meta: unimplementedSignal,
          files: { },
          parsed: { },
          imports: unimplementedSignal,
          compiled: { },
          problems: Signal.ok(compiledFile.problems),
          rendered: compiledFile.rendered,
          exportType: Signal.ok(compiledFile.exportType),
          exportValue: Signal.ok(compiledFile.exportValue),
        })));
      }
    });
    return [ importsSet.asImmutable(), noteEnv.asImmutable() ]
  });

  return ast.liftToTry().flatMap(astTry => {
    const astTryOrig = astTry;
    switch (astTry.type) {
      case 'ok':
        // TODO(jaked) maybe this can be simplified once we inline compileTable
        return importsNoteEnv.flatMap(importsNoteEnv => {
          const [ imports, noteEnv] = importsNoteEnv;
          return Signal.joinImmutableMap(Signal.ok(noteEnv)).flatMap(noteEnv =>
            compileTable(trace, astTry.ok, noteTag, imports, noteEnv, setSelected)
              .map(compiled => ({ ...compiled, ast: astTryOrig }))
          );
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
