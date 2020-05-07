import { Tuple2 } from '../../util/Tuple';
import { bug } from '../../util/bug';
import Type from '../Type';

export default function lensType(type: Type): Type {
  switch (type.kind) {
    case 'Object':
      return Type.intersection(
        Type.functionType([], type),
        Type.functionType([type], Type.undefined),
        Type.object(type.fields.map(({ _1: name, _2: type }) => {
          return new Tuple2(name, lensType(type));
        }))
      );

    case 'Map':
      return Type.intersection(
        Type.functionType([], type),
        Type.functionType([type], Type.undefined),
        Type.map(type.key, lensType(type.value))
      );

    case 'Union':
      return Type.intersection(
        Type.functionType([], type),
        Type.functionType([type], Type.undefined), // TODO(jaked) Type.void?

        // TODO(jaked)
        // a union over object types should permit projecting common fields
        // but this also return lens types that are redundant with the ones above
        // e.g. for string | boolean we get
        //   () => string | boolean & (string | boolean) => undefined &
        //   ((() => string & string => undefined) | () => boolean & boolean => undefined)
        // maybe we should special case this somehow to avoid blowup.
        Type.union(...type.types.map(lensType))
      );

    case 'boolean':
    case 'number':
    case 'string':
    case 'null':
    case 'undefined':
    case 'Singleton':
      return Type.intersection(
        Type.functionType([], type),
        Type.functionType([type], Type.undefined) // TODO(jaked) Type.void?
      );

    default:
      bug(`unimplemented lensType(${type.kind})`);
  }
}
