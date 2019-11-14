import * as Type from './constructors';

export const undefinedOrString = Type.union(Type.undefined, Type.string);
export const undefinedOrNumber = Type.union(Type.undefined, Type.number);
export const numberOrString = Type.union(Type.number, Type.string);

export const falsy =
  Type.union(
    Type.singleton(false),
    Type.nullType,
    Type.undefined,
    Type.singleton(0),
    Type.singleton(''),
  );

export const notFalsy =
  Type.intersection(
    Type.not(Type.singleton(false)),
    Type.not(Type.nullType),
    Type.not(Type.undefined),
    Type.not(Type.singleton(0)),
    Type.not(Type.singleton('')),
  );

export const truthy =
  Type.singleton(true);

export const notTruthy =
  Type.not(Type.singleton(true));

export const reactElementType = Type.abstract('React.Element');
// TODO(jaked)
// fragments are also permitted here (see ReactNode in React typing)
// but we need recursive types to express it (ReactFragment = Array<ReactNode>)
// in the meantime we'll permit top-level fragments only
const reactNodeType_ =
  Type.union(reactElementType, Type.booleanType, Type.number, Type.string, Type.nullType, Type.undefined);
export const reactNodeType =
  Type.union(reactNodeType_, Type.array(reactNodeType_));
