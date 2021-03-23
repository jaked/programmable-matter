import * as ESTree from '../ESTree';
import { bug } from '../../util/bug';
import * as Types from './types';
import * as Type from './constructors';
import { union } from './union';
import { intersection } from './intersection';
import * as model from '../../model';
import * as Error from '../Typecheck/error';

function stringOfQualifiedIdentifier(
  ident: ESTree.QualifiedIdentifier
): string {
  switch (ident.type) {
    case 'Identifier':
      return ident.name;

    case 'TSQualifiedName': {
      const left = stringOfQualifiedIdentifier(ident.left);
      const right = stringOfQualifiedIdentifier(ident.right);
      return `${left}.${right}`;
    }
  }
}

export default function ofTSType(
  tsType: ESTree.TypeAnnotation,
  typesMap?: model.TypesMap,
): Types.Type {
  switch (tsType.type) {
    case 'TSParenthesizedType':
      return ofTSType(tsType.typeAnnotation, typesMap);

    case 'TSNeverKeyword': return Type.never;
    case 'TSUnknownKeyword': return Type.unknown;
    case 'TSUndefinedKeyword': return Type.undefined;
    case 'TSNullKeyword': return Type.nullType;
    case 'TSBooleanKeyword': return Type.boolean;
    case 'TSNumberKeyword': return Type.number;
    case 'TSStringKeyword': return Type.string;

    case 'TSTypeLiteral': {
      const props =
        tsType.members.reduce<{ [name: string]: Types.Type }>(
          (obj, mem) => {
            if (mem.type !== 'TSPropertySignature') bug(`unimplemented ${mem.type}`);
            if (mem.key.type !== 'Identifier') bug(`unimplemented ${mem.key.type}`);
            if (!mem.typeAnnotation) bug(`expected type for ${mem.key.name}`);
            const type = ofTSType(mem.typeAnnotation.typeAnnotation, typesMap);
            return Object.assign(obj, { [mem.key.name]: type });
          },
          { }
        );
      return Type.object(props);
    }

    case 'TSTupleType':
      return Type.tuple(...tsType.elementTypes.map(t => ofTSType(t, typesMap)));

    case 'TSArrayType':
      return Type.array(ofTSType(tsType.elementType, typesMap));

    case 'TSFunctionType': {
      const args =
        tsType.parameters.map(param => {
          if (param.type !== 'Identifier') bug(`unimplemented ${param.type}`);
          if (!param.typeAnnotation) bug(`expected type for ${param.name}`);
          if (param.typeAnnotation.type !== 'TSTypeAnnotation') bug(`unimplemented ${param.typeAnnotation.type}`);
          return ofTSType(param.typeAnnotation.typeAnnotation, typesMap);
        });
      if (!tsType.typeAnnotation) bug(`expected return type`);
      const ret = ofTSType(tsType.typeAnnotation.typeAnnotation, typesMap);
      return Type.functionType(args, ret);
    }

    case 'TSLiteralType':
      return Type.singleton(tsType.literal.value);

    case 'TSUnionType':
      return union(...tsType.types.map(t => ofTSType(t, typesMap)));

    case 'TSIntersectionType':
      return intersection(...tsType.types.map(t => ofTSType(t, typesMap)));

    case 'TSTypeReference': {
      const label = stringOfQualifiedIdentifier(tsType.typeName);
      const tsParams = tsType.typeParameters?.params ?? [];
      const params: Types.Type[] = [];

      // tsParams.map(t => ofTSType(t, typesMap));

      switch (label) {
        case 'React.ReactNode':
          tsParams.forEach(tsP =>
            Error.withLocation(tsP, 'expected 0 params', typesMap)
          );
          break;

        // TODO(jaked)
        // this seems to be somewhat deprecated, see
        // https://github.com/typescript-cheatsheets/react-typescript-cheatsheet#function-components
        // but it is useful to avoid a separate `type Props = ...`
        case 'React.FC':
        case 'React.FunctionComponent':

        case 'React.Component':
          if (tsParams.length < 1) {
            Error.withLocation(tsType.typeName, 'expected 1 param', typesMap);
            params.push(Type.object({ }));
          } else {
            tsParams.forEach((tsP, i) => {
              switch (i) {
                case 0: {
                  const param = ofTSType(tsP, typesMap);
                  if (param.kind === 'Object') {
                    params.push(param);
                  } else {
                    Error.withLocation(tsP, 'expected object param', typesMap)
                    params.push(Type.object({ }));
                  }
                }
                break;

                default:
                  Error.withLocation(tsP, 'expected 1 param', typesMap);
              }
            });
          }
          break;

        default:
          Error.withLocation(tsType.typeName, 'unknown type', typesMap);
          tsParams.forEach(tsP =>
            Error.withLocation(tsP, 'unknown type', typesMap)
          );
          return Type.unknown;
      }

      return Type.abstract(label, ...params);
    }

    default: bug(`unimplemented ${(tsType as ESTree.TypeAnnotation).type}`);
  }
}
