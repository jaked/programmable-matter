import * as ESTree from '../estree';
import { bug } from '../util/bug';
import * as Types from './types';
import * as Type from './constructors';
import { union } from './union';
import { intersection } from './intersection';
import * as model from '../model';
import * as Error from '../lang/Typecheck/error';

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

const okLabels = [
  'React.ReactNode', 'React.Component', 'React.FC', 'React.FunctionComponent',
  'Code', 'Session'
]

export default function ofTSType(
  tsType: ESTree.TypeAnnotation,
  interfaceMap?: model.InterfaceMap,
): Types.Type {
  switch (tsType.type) {
    case 'TSParenthesizedType':
      return ofTSType(tsType.typeAnnotation, interfaceMap);

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
            const type = ofTSType(mem.typeAnnotation.typeAnnotation, interfaceMap);
            return Object.assign(obj, { [mem.key.name]: type });
          },
          { }
        );
      return Type.object(props);
    }

    case 'TSTupleType':
      return Type.tuple(...tsType.elementTypes.map(t => ofTSType(t, interfaceMap)));

    case 'TSArrayType':
      return Type.array(ofTSType(tsType.elementType, interfaceMap));

    case 'TSFunctionType': {
      const args =
        tsType.parameters.map(param => {
          if (param.type !== 'Identifier') bug(`unimplemented ${param.type}`);
          if (!param.typeAnnotation) bug(`expected type for ${param.name}`);
          if (param.typeAnnotation.type !== 'TSTypeAnnotation') bug(`unimplemented ${param.typeAnnotation.type}`);
          return ofTSType(param.typeAnnotation.typeAnnotation, interfaceMap);
        });
      if (!tsType.typeAnnotation) bug(`expected return type`);
      const ret = ofTSType(tsType.typeAnnotation.typeAnnotation, interfaceMap);
      return Type.functionType(args, ret);
    }

    case 'TSLiteralType':
      return Type.singleton(tsType.literal.value);

    case 'TSUnionType':
      return union(...tsType.types.map(t => ofTSType(t, interfaceMap)));

    case 'TSIntersectionType':
      return intersection(...tsType.types.map(t => ofTSType(t, interfaceMap)));

    case 'TSTypeReference': {
      const label = stringOfQualifiedIdentifier(tsType.typeName);
      if (okLabels.includes(label)) {
        const tsParams = tsType.typeParameters?.params ?? [];
        const params = tsParams.map(t => ofTSType(t, interfaceMap));
        return Type.abstract(label, ...params);
      } else {
        return Type.error(
          Error.withLocation(tsType.typeName, `unknown abstract type '${label}'`, interfaceMap).err
        );
      }
    }

    default: bug(`unimplemented ${(tsType as ESTree.TypeAnnotation).type}`);
  }
}
