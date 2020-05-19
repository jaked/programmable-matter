import { TypeAnnotation } from '../ESTree';
import { bug } from '../../util/bug';
import * as Types from './types';
import * as Type from './constructors';
import { union } from './union';
import { intersection } from './intersection';

export default function ofTSType(tsType: TypeAnnotation): Types.Type {
  switch (tsType.type) {
    case 'TSParenthesizedType':
      return ofTSType(tsType.typeAnnotation);

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
            const type = ofTSType(mem.typeAnnotation.typeAnnotation);
            return Object.assign(obj, { [mem.key.name]: type });
          },
          { }
        );
      return Type.object(props);
    }

    case 'TSTupleType':
      return Type.tuple(...tsType.elementTypes.map(ofTSType));

    case 'TSArrayType':
      return Type.array(ofTSType(tsType.elementType));

    case 'TSFunctionType': {
      const args =
        tsType.parameters.map(param => {
          if (param.type !== 'Identifier') bug(`unimplemented ${param.type}`);
          if (!param.typeAnnotation) bug(`expected type for ${param.name}`);
          if (param.typeAnnotation.type !== 'TSTypeAnnotation') bug(`unimplemented ${param.typeAnnotation.type}`);
          return ofTSType(param.typeAnnotation.typeAnnotation);
        });
      if (!tsType.typeAnnotation) bug(`expected return type`);
      const ret = ofTSType(tsType.typeAnnotation.typeAnnotation);
      return Type.functionType(args, ret);
    }

    case 'TSLiteralType':
      return Type.singleton(tsType.literal.value);

    case 'TSUnionType':
      return union(...tsType.types.map(ofTSType));

    case 'TSIntersectionType':
      return intersection(...tsType.types.map(ofTSType));

    case 'TSTypeReference': {
      const typeName = tsType.typeName;
      if (typeName.type === 'TSQualifiedName' && typeName.left.type === 'Identifier' && typeName.right.type === 'Identifier') {
        const label = `${typeName.left.name}.${typeName.right.name}`;
        const params = tsType.typeParameters ? tsType.typeParameters.params.map(ofTSType) : [];
        return Type.abstract(label, ...params);
      }
      bug(`unimplemented TSTypeReference`);
    }

    default: bug(`unimplemented ${(tsType as TypeAnnotation).type}`);
  }
}
