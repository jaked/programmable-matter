import * as Immutable from 'immutable';
import * as Name from '../../util/Name';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { AstAnnotations } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { check } from './check';
import { narrowType, narrowEnvironment } from './narrow';

function synthIdentifier(
  ast: ESTree.Identifier,
  env: Env,
  annots: AstAnnotations,
): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else if (ast.name === 'undefined') return Type.undefined;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, annots);
}

function synthLiteral(
  ast: ESTree.Literal,
  env: Env,
  annots: AstAnnotations,
): Type {
  return Type.singleton(ast.value);
}

function synthArrayExpression(
  ast: ESTree.ArrayExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  const types = ast.elements.map(e => synth(e, env, annots));
  const elem = Type.union(...types);
  return Type.array(elem);
}

function synthObjectExpression(
  ast: ESTree.ObjectExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  const seen = new Set();
  const fieldTypes = ast.properties.reduce<{ [n: string]: Type }>(
    (obj, prop) => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal property name');
      }
      if (seen.has(name)) {
        Error.withLocation(prop.key, `duplicate property name '${name}'`, annots);
        return obj;
      } else {
        seen.add(name);
        return { ...obj, [name]: synth(prop.value, env, annots) };
      }
    },
    {}
  );
  return Type.object(fieldTypes);
}

const typeofType =
  Type.enumerate('undefined', 'boolean', 'number', 'string', 'function', 'object', 'error')

function synthUnaryExpression(
  ast: ESTree.UnaryExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  const type = synth(ast.argument, env, annots);

  switch (type.kind) {
    case 'Error':
      switch (ast.operator) {
        case '+':
        case '-':
          // TODO(jaked) does this make sense?
          return Type.singleton(0);
        case '!':
          return Type.singleton(true);
        case 'typeof':
          return Type.singleton('error');
        default:
          bug(`unhandled ast ${ast.operator}`);
      }

    case 'Singleton':
      switch (ast.operator) {
        case '+':
        case '-':
          if (type.base.kind === 'number')
            switch (ast.operator) {
              case '+': return Type.singleton(type.value);
              case '-': return Type.singleton(-type.value);
              default: bug(`unexpected ast.operator ${ast.operator}`);
            }
          else
            return Error.withLocation(ast, 'incompatible operand to ${ast.operator}', annots);

        case '!':
          return Type.singleton(!type.value);
        case 'typeof':
          return Type.singleton(typeof type.value);
        default:
          bug(`unhandled ast ${ast.operator}`);
      }

    default:
      switch (ast.operator) {
        case '+':
        case '-':
          if (type.kind === 'number')
            switch (ast.operator) {
              case '+': return Type.number;
              case '-': return Type.number;
              default: bug(`unexpected ast.operator ${ast.operator}`);
            }
          else
            return Error.withLocation(ast, 'incompatible operand to ${ast.operator}', annots);
        case '!':
          return Type.boolean;
        case 'typeof':
          return typeofType;
        default:
          bug(`unhandled ast ${ast.operator}`);
      }
  }
}

function synthLogicalExpression(
  ast: ESTree.LogicalExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  switch (ast.operator) {
    case '&&': {
      const left = synth(ast.left, env, annots);

      switch (left.kind) {
        case 'Error': {
          const right = synth(ast.right, env, annots);
          return left;
        }

        case 'Singleton': {
          const right = synth(ast.right, env, annots); // synth even when !left.value
          return !left.value ? left : right;
        }

        default: {
          const rightEnv = narrowEnvironment(env, ast.left, true, annots);
          const right = synth(ast.right, rightEnv, annots);
          return Type.union(narrowType(left, Type.falsy), right);
        }
      }
    }

    case '||': {
      const left = synth(ast.left, env, annots);

      switch (left.kind) {
        case 'Error': {
          return synth(ast.right, env, annots);
        }

        case 'Singleton': {
          const right = synth(ast.right, env, annots); // synth even when left.value
          return left.value ? left : right;
        }

        default: {
          const rightEnv = narrowEnvironment(env, ast.left, false, annots);
          const right = synth(ast.right, rightEnv, annots);
          // TODO(jaked) Type.union(Type.intersection(left, Type.notFalsy), right) ?
          return Type.union(left, right);
        }
      }
    }

    default:
      bug(`unexpected operator ${ast.operator}`);
  }
}

function synthBinaryExpression(
  ast: ESTree.BinaryExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  let left = synth(ast.left, env, annots);
  let right = synth(ast.right, env, annots);

  // TODO(jaked) handle other operators
  // TODO(jaked) tighten up
  switch (ast.operator) {
    case '===':
      if (left.kind === 'Error' || right.kind === 'Error')
        return Type.singleton(false);
      else if (left.kind === 'Singleton' && right.kind === 'Singleton')
        return Type.singleton(left.value === right.value);
      else
        return Type.boolean;

    case '!==':
      if (left.kind === 'Error' || right.kind === 'Error')
        return Type.singleton(true);
      else if (left.kind === 'Singleton' && right.kind === 'Singleton')
        return Type.singleton(left.value !== right.value);
      else
        return Type.boolean;

    case '+':
      if (left.kind === 'Error')
        return right;
      else if (right.kind === 'Error')
        return left;
      else if (left.kind === 'Singleton' && left.base.kind === 'number' &&
          right.kind === 'Singleton' && right.base.kind === 'number')
        return Type.singleton(left.value + right.value);
      else if (left.kind === 'Singleton' && left.base.kind === 'string' &&
          right.kind === 'Singleton' && right.base.kind === 'string')
        return Type.singleton(left.value + right.value);
      else if (Type.isPrimitiveSubtype(left, Type.number) && Type.isPrimitiveSubtype(right, Type.number))
        return Type.number;
      else if (Type.isPrimitiveSubtype(left, Type.string) && Type.isPrimitiveSubtype(right, Type.string))
        return Type.string;
      else
        return Error.withLocation(ast, 'incompatible operands to +', annots);

    case '-':
      if (left.kind === 'Error')
        return right;
      else if (right.kind === 'Error')
        return left;
      else if (left.kind === 'Singleton' && left.base.kind === 'number' &&
          right.kind === 'Singleton' && right.base.kind === 'number')
        return Type.singleton(left.value - right.value);
      else if (Type.isPrimitiveSubtype(left, Type.number) && Type.isPrimitiveSubtype(right, Type.number))
        return Type.number;
      else
        return Error.withLocation(ast, 'incompatible operands to -', annots);

    case '*':
      if (left.kind === 'Error')
        return right;
      else if (right.kind === 'Error')
        return left;
      else if (left.kind === 'Singleton' && left.base.kind === 'number' &&
          right.kind === 'Singleton' && right.base.kind === 'number')
        return Type.singleton(left.value * right.value);
      else if (Type.isPrimitiveSubtype(left, Type.number) && Type.isPrimitiveSubtype(right, Type.number))
        return Type.number;
      else
        return Error.withLocation(ast, 'incompatible operands to *', annots);

    case '/':
      if (left.kind === 'Error')
        return right;
      else if (right.kind === 'Error')
        return left;
      else if (left.kind === 'Singleton' && left.base.kind === 'number' &&
          right.kind === 'Singleton' && right.base.kind === 'number')
        return Type.singleton(left.value / right.value);
      else if (Type.isPrimitiveSubtype(left, Type.number) && Type.isPrimitiveSubtype(right, Type.number))
        return Type.number;
      else
        return Error.withLocation(ast, 'incompatible operands to /', annots);

    case '%':
      if (left.kind === 'Error')
        return right;
      else if (right.kind === 'Error')
        return left;
      else if (left.kind === 'Singleton' && left.base.kind === 'number' &&
          right.kind === 'Singleton' && right.base.kind === 'number')
        return Type.singleton(left.value % right.value);
      else if (Type.isPrimitiveSubtype(left, Type.number) && Type.isPrimitiveSubtype(right, Type.number))
        return Type.number;
      else
        return Error.withLocation(ast, 'incompatible operands to %', annots);

    default:
      bug(`unimplemented operator ${ast.operator}`);
  }
}

function synthSequenceExpression(
  ast: ESTree.SequenceExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  ast.expressions.forEach((e, i) => {
    if (i < ast.expressions.length - 1)
      synth(e, env, annots);
  });
  return synth(ast.expressions[ast.expressions.length - 1], env, annots);
}

function synthMemberExpression(
  ast: ESTree.MemberExpression,
  env: Env,
  annots: AstAnnotations,
  objectType?: Type | undefined
): Type {
  objectType = objectType || synth(ast.object, env, annots);

  if (objectType.kind === 'Error') {
    return objectType;

  } else if (objectType.kind === 'Intersection') {
    const memberTypes =
      objectType.types
        // don't annotate AST with possibly spurious errors
        // TODO(jaked) rethink
        .map(type => synthMemberExpression(ast, env, new Map(), type));
    if (memberTypes.every(type => type.kind === 'Error')) {
      if (ast.property.type === 'Identifier')
        return Error.unknownField(ast.property, ast.property.name, annots);
      else
        // TODO(jaked) could result from error in computed property
        return Error.unknownField(ast.property, '[computed]', annots);
    } else {
      const retTypes = memberTypes.filter(type => type.kind !== 'Error');
      return Type.intersection(...retTypes);
    }

  } else if (objectType.kind === 'Union') {
    const types =
      objectType.types.map(type => synthMemberExpression(ast, env, annots, type));
    return Type.union(...types);

  } else if (ast.computed) {
    switch (objectType.kind) {
      case 'Array': {
        const propertyType = check(ast.property, env, Type.number, annots);
        if (propertyType.kind === 'Error')
          return Type.undefined;
        else
          return objectType.elem;
      }

      case 'Tuple': {
        // check against union of valid indexes
        const elems = objectType.elems;
        const validIndexes =
          elems.map((_, i) => Type.singleton(i));
        check(ast.property, env, Type.union(...validIndexes), annots);

        // synth to find out which valid indexes are actually present
        const propertyType = synth(ast.property, env, annots);
        const presentIndexes: Array<number> = [];

        if (propertyType.kind === 'Error') {
          return propertyType;

        } else if (propertyType.kind === 'Singleton') {
          presentIndexes.push(propertyType.value);

        } else if (propertyType.kind === 'Union') {
          propertyType.types.forEach(type => {
            if (type.kind === 'Singleton') presentIndexes.push(type.value);
            else bug('expected Singleton');
          });

        } else bug('expected Singleton or Union')

        // and return union of element types of present indexes
        const presentTypes =
          presentIndexes.map(i => elems.get(i) ?? bug());
        return Type.union(...presentTypes);
      }

      case 'Object': {
        // check against union of valid indexes
        const fields = objectType.fields;
        const validIndexes =
          fields.map(({ _1: name }) => Type.singleton(name));
        check(ast.property, env, Type.union(...validIndexes), annots);

        // synth to find out which valid indexes are actually present
        const propertyType = synth(ast.property, env, annots);
        const presentIndexes: Array<string> = [];

        if (propertyType.kind === 'Error') {
          return propertyType;

        } else if (propertyType.kind === 'Singleton') {
          presentIndexes.push(propertyType.value);

        } else if (propertyType.kind === 'Union') {
          propertyType.types.forEach(type => {
            if (type.kind === 'Singleton') presentIndexes.push(type.value);
            else bug('expected Singleton');
          });

        } else bug('expected Singleton or Union')

        // and return union of element types of present indexes
        const presentTypes =
          presentIndexes.map(i => {
            const fieldType = fields.find(({ _1: name }) => name === i);
            if (fieldType) return fieldType._2;
            else bug('expected valid index');
          });
        return Type.union(...presentTypes);
      }

      // case 'Module':
      // no computed members on modules, different members may have different atomness
      // (for that matter, maybe we should not have computed members on tuples / objects)

      default:
        return bug('unimplemented synthMemberExpression ' + objectType.kind);
    }
  } else {
    if (ast.property.type !== 'Identifier')
      bug('expected identifier on non-computed property');

    const name = ast.property.name;
    switch (objectType.kind) {
      case 'string':
        switch (name) {
          case 'startsWith':
            return Type.functionType([Type.string], Type.boolean);
        }
        break;

      case 'number':
        switch (name) {
          case 'toString':
            return Type.functionType([], Type.string);
        }
        break;

      case 'Array':
        switch (name) {
          case 'size': return Type.number;

          case 'some':
          case 'every':
            return Type.functionType(
              [
                Type.functionType(
                  [ objectType.elem, Type.number, objectType ],
                  Type.boolean
                )
              ],
              Type.boolean,
            );

          case 'filter':
            return Type.functionType(
              [
                Type.functionType(
                  [ objectType.elem, Type.number, objectType ],
                  Type.boolean
                )
              ],
              objectType,
            );

          case 'forEach':
            return Type.functionType(
              [
                Type.functionType(
                  [ objectType.elem, Type.number, objectType ],
                  Type.undefined
                )
              ],
              Type.undefined,
            );

          case 'map':
            return Type.functionType(
              [
                Type.functionType(
                  [ objectType.elem, Type.number, objectType ],
                  Type.reactNodeType // TODO(jaked) temporary
                )
              ],
              Type.array(Type.reactNodeType),
            );
        }
        break;

      case 'Map':
        switch (name) {
          case 'size': return Type.number;

          case 'set':
            return Type.functionType(
              [ objectType.key, objectType.value ],
              objectType,
            );

          case 'delete':
            return Type.functionType(
              [ objectType.key ],
              objectType,
            );

          case 'clear':
            return Type.functionType([], objectType);

          case 'filter':
            return Type.functionType(
              [
                Type.functionType(
                  [ objectType.value, objectType.key, objectType ],
                  Type.boolean
                )
              ],
              objectType,
            );

          case 'toList':
            return Type.functionType([], Type.array(objectType.value));

          case 'update':
            return Type.functionType(
              [ objectType.key, Type.functionType([ objectType.value ], objectType.value) ],
              objectType
            )

          case 'get':
            return Type.functionType(
              [ objectType.key ],
              Type.undefinedOr(objectType.value),
            );
        }
        break;

      case 'Object': {
        const type = objectType.getFieldType(name);
        if (type) return type;
        break;
      }

      case 'Module': {
        const type = objectType.getFieldType(name);
        if (type) return type;
        break;
      }

    }
    return Error.unknownField(ast.property, name, annots);
  }
}

function synthCallExpression(
  ast: ESTree.CallExpression,
  env:Env,
  annots: AstAnnotations,
  calleeType?: Type | undefined
): Type {
  calleeType = calleeType || Type.expand(synth(ast.callee, env, annots));

  if (calleeType.kind === 'Intersection') {
    const callTypes =
      calleeType.types
        .filter(type => type.kind === 'Function')
        .map(type => synthCallExpression(ast, env, new Map(), type));
    const okTypes = callTypes.filter(type => type.kind !== 'Error');
    switch (okTypes.size) {
      case 0:
        // TODO(jaked) better error message
        return Error.withLocation(ast, 'no matching function type');
      case 1: {
        const okCalleeType =
          calleeType.types.get(callTypes.findIndex(type => type.kind !== 'Error'));
        // redo for annots. TODO(jaked) immutable update for annots
        return synthCallExpression(ast, env, annots, okCalleeType);
      }
      default:
        // TODO(jaked)
        // we don't want to annotate arg ASTs with multiple types
        // for different branches of intersection.
        // for evaluation, dynamic semantics depend on types
        //   so we need concrete types
        //   or could elaborate to dynamic type tests
        //     with concrete types in each branch
        // for editor, it's just confusing, what else could we do?
        // TODO(jaked) better error message
        return Error.withLocation(ast, 'too many matching function types');
    }
  } else if (calleeType.kind === 'Function') {
    if (ast.arguments.length > calleeType.args.size)
      return Error.wrongArgsLength(ast, calleeType.args.size, ast.arguments.length);
    const calleeType2 = calleeType; // preserve type inside closure
    const types = calleeType.args.map((expectedType, i) => {
      if (i < ast.arguments.length) {
        const type = check(ast.arguments[i], env, expectedType, annots);
        if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
          return Type.undefined;
        else
          return type;
      } else if (Type.isSubtype(Type.undefined, expectedType)) {
        return Type.undefined;
      } else
        return Error.wrongArgsLength(ast, calleeType2.args.size, ast.arguments.length, annots);
    });
    return types.find(type => type.kind === 'Error') ?? calleeType.ret;
  } else {
    return Error.expectedType(ast.callee, 'function', calleeType, annots)
  }
}

function patTypeEnvIdentifier(
  ast: ESTree.Identifier,
  type: Type,
  env: Env,
  annots: AstAnnotations,
): Env {
  if (env.has(ast.name)) {
    Error.withLocation(ast, `identifier ${ast.name} already bound in pattern`, annots);
    return env;
  } else {
    return env.set(ast.name, type);
  }
}

function patTypeEnvObjectPattern(
  ast: ESTree.ObjectPattern,
  t: Type.ObjectType,
  env: Env,
  annots: AstAnnotations,
): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field._1 === key.name)
    if (!field) {
      Error.unknownField(key, key.name, annots);
    } else {
      env = patTypeEnv(prop.value, field._2, env, annots);
    }
  });
  return env;
}

function patTypeEnv(
  ast: ESTree.Pattern,
  t: Type,
  env: Env,
  annots: AstAnnotations,
): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env, annots);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env, annots);
  else {
    Error.withLocation(ast, `incompatible pattern for type ${Type.toString(t)}`, annots);
    return env;
  }
}

function genPatType(
  ast: ESTree.Pattern,
  t: Type,
): Type {
  if (ast.type === 'ObjectPattern') {
    return Type.object(
      ast.properties.reduce((obj, prop) =>
        ({ ...obj, [prop.key.name]: prop.shorthand ? t : genPatType(prop.value, t) }),
        {}
      )
    );
  } else if (ast.type === 'Identifier') {
    return t;
  } else {
    bug(`unexpected ast type '${(ast as ESTree.Pattern).type}'`);
  }
}

function synthArrowFunctionExpression(
  ast: ESTree.ArrowFunctionExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  let patEnv: Env = Immutable.Map();
  const paramTypes = ast.params.map(param => {
    if (!param.typeAnnotation) {
      const t = Error.withLocation(param, `function parameter must have a type`, annots);
      patEnv = patTypeEnv(param, genPatType(param, t), patEnv, annots);
      return genPatType(param, Type.unknown);
    }
    const t = Type.ofTSType(param.typeAnnotation.typeAnnotation, annots);
    patEnv = patTypeEnv(param, t, patEnv, annots);
    return t;
  });
  env = env.concat(patEnv);
  const type = synth(ast.body, env, annots);
  return Type.functionType(paramTypes, type);
}

function synthConditionalExpression(
  ast: ESTree.ConditionalExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  const testType = synth(ast.test, env, annots);

  switch (testType.kind) {
    // conjecture: we can't learn anything new from narrowing
    // when test is error / singleton
    // (would be nice to prove this, but no harm in not narrowing)

    // when the test has a static value we don't check the untaken branch
    // this is a little weird but consistent with typechecking
    // only as much as needed to run the program

    case 'Error': {
      return synth(ast.alternate, env, annots);
    }

    case 'Singleton':
      if (testType.value)
        return synth(ast.consequent, env, annots);
      else
        return synth(ast.alternate, env, annots);

    default: {
      const envConsequent = narrowEnvironment(env, ast.test, true, annots);
      const envAlternate = narrowEnvironment(env, ast.test, false, annots);
      const consequent = synth(ast.consequent, envConsequent, annots);
      const alternate = synth(ast.alternate, envAlternate, annots);
      return Type.union(consequent, alternate);
    }
  }
}

function synthTemplateLiteral(
  ast: ESTree.TemplateLiteral,
  env: Env,
  annots: AstAnnotations,
): Type {
  // TODO(jaked) handle interpolations
  return Type.string;
}

function synthJSXIdentifier(
  ast: ESTree.JSXIdentifier,
  env: Env,
  annots: AstAnnotations,
): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, annots);
}

function synthJSXElement(
  ast: ESTree.JSXElement,
  env: Env,
  annots: AstAnnotations,
): Type {
  const type = Type.expand(synth(ast.openingElement.name, env, annots));

  const [ attrsType, retType ] = ((): [ Type.ObjectType, Type.Type ] => {
    switch (type.kind) {
      case 'Error':
        return [ Type.object({}), type ]

      case 'Function':
        if (type.args.size === 0) {
          return [ Type.object({}), type.ret ];
        } else if (type.args.size === 1) {
          const argType = type.args.get(0) ?? bug();
          if (argType.kind === 'Object') {
            const childrenField = argType.fields.find(field => field._1 === 'children');
            if (!childrenField || Type.isSubtype(Type.array(Type.reactNodeType), childrenField._2))
              return [ argType, type.ret ];
          }
        }
        break;
    }
    return [ Type.object({}), Error.expectedType(ast.openingElement.name, 'component type', type, annots) ];
  })();

  const attrTypes = ast.openingElement.attributes.map(attr => {
    const expectedType = attrsType.getFieldType(attr.name.name);
    if (expectedType) {
      if (attr.value) {
        const type = check(attr.value, env, expectedType, annots);
        if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
          return Type.undefined;
        else
          return type;
      } else {
        const actual = Type.singleton(true);
        if (Type.isSubtype(actual, expectedType))
          return actual;
        else if (Type.isSubtype(Type.undefined, expectedType))
          return Type.undefined;
        else
          return Error.expectedType(attr.name, expectedType, actual, annots);
      }
    } else {
      Error.extraField(attr.name, attr.name.name, annots);
      if (attr.value) {
        return synth(attr.value, env, annots);
      } else {
        return Type.singleton(true);
      }
    }
  });

  ast.children.forEach(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), annots)
  );

  const attrNames =
    new Set(ast.openingElement.attributes.map(({ name }) => name.name ));
  let missingField: undefined | Type.ErrorType = undefined;
  attrsType.fields.forEach(({ _1: name, _2: type }) => {
    if (name !== 'children' &&
        !attrNames.has(name) &&
        !Type.isSubtype(Type.undefined, type))
      // TODO(jaked) it would be better to mark the whole JSXElement as having an error
      // but for now this get us the right error highlighting in Editor
      missingField = Error.missingField(ast.openingElement.name, name, annots);
  });
  if (missingField) return missingField;

  return attrTypes.find(type => type.kind === 'Error') ?? retType;
}

function synthJSXFragment(
  ast: ESTree.JSXFragment,
  env: Env,
  annots: AstAnnotations,
): Type {
  ast.children.forEach(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), annots)
  );
  return Type.reactNodeType;
}

function synthJSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  env: Env,
  annots: AstAnnotations,
): Type {
  return synth(ast.expression, env, annots);
}

function synthJSXText(
  ast: ESTree.JSXText,
  env: Env,
  annots: AstAnnotations,
): Type {
  return Type.string;
}

function synthJSXEmptyExpression(
  ast: ESTree.JSXEmptyExpression,
  env: Env,
  annots: AstAnnotations,
): Type {
  return Type.undefined;
}

function synthHelper(
  ast: ESTree.Expression,
  env: Env,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    case 'Identifier':              return synthIdentifier(ast, env, annots);
    case 'Literal':                 return synthLiteral(ast, env, annots);
    case 'ArrayExpression':         return synthArrayExpression(ast, env, annots);
    case 'ObjectExpression':        return synthObjectExpression(ast, env, annots);
    case 'ArrowFunctionExpression': return synthArrowFunctionExpression(ast, env, annots);
    case 'UnaryExpression':         return synthUnaryExpression(ast, env, annots);
    case 'LogicalExpression':       return synthLogicalExpression(ast, env, annots);
    case 'BinaryExpression':        return synthBinaryExpression(ast, env, annots);
    case 'SequenceExpression':      return synthSequenceExpression(ast, env, annots);
    case 'MemberExpression':        return synthMemberExpression(ast, env, annots);
    case 'CallExpression':          return synthCallExpression(ast, env, annots);
    case 'ConditionalExpression':   return synthConditionalExpression(ast, env, annots);
    case 'TemplateLiteral':         return synthTemplateLiteral(ast, env, annots);
    case 'JSXIdentifier':           return synthJSXIdentifier(ast, env, annots);
    case 'JSXElement':              return synthJSXElement(ast, env, annots);
    case 'JSXFragment':             return synthJSXFragment(ast, env, annots);
    case 'JSXExpressionContainer':  return synthJSXExpressionContainer(ast, env, annots);
    case 'JSXText':                 return synthJSXText(ast, env, annots);
    case 'JSXEmptyExpression':      return synthJSXEmptyExpression(ast, env, annots);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function synth(
  ast: ESTree.Expression,
  env: Env,
  annots: AstAnnotations,
): Type {
  const type = synthHelper(ast, env, annots);
  if (annots) annots.set(ast, type);
  return type;
}

function importDecl(
  moduleName: string,
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Type.ModuleType>,
  env: Env,
  annots: AstAnnotations,
): Env {
  const importedModuleName = Name.rewriteResolve(moduleEnv, moduleName, decl.source.value);
  if (!importedModuleName) {
    const error = Error.withLocation(decl.source, `no module '${decl.source.value}'`, annots);
    decl.specifiers.forEach(spec => {
      env = env.set(spec.local.name, error);
    });
  } else {
    const module = moduleEnv.get(importedModuleName) ?? bug(`expected module '${importedModuleName}'`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          env = env.set(spec.local.name, module);
        }
        break;

        case 'ImportDefaultSpecifier': {
          const defaultField = module.fields.find(ft => ft._1 === 'default');
          if (defaultField) {
            env = env.set(spec.local.name, defaultField._2);
          } else {
            const error = Error.withLocation(spec.local, `no default export on '${decl.source.value}'`, annots);
            env = env.set(spec.local.name, error);
          }
        }
        break;

        case 'ImportSpecifier': {
          const importedField = module.fields.find(ft => ft._1 === spec.imported.name)
          if (importedField) {
            env = env.set(spec.local.name, importedField._2);
          } else {
            const error = Error.withLocation(spec.imported, `no exported member '${spec.imported.name}' on '${decl.source.value}'`, annots);
            env = env.set(spec.local.name, error);
          }
        }
        break;
      }
    });
  }
  return env;
}

function synthVariableDecl(
  decl: ESTree.VariableDeclaration,
  env: Env,
  annots: AstAnnotations,
  exportTypes?: { [s: string]: Type },
): Env {
  decl.declarations.forEach(declarator => {
    let type: Type;
    const typeAnnotation = declarator.id.typeAnnotation ?
      Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, annots) :
      undefined;
    if (declarator.init) {
      const initEnv = decl.kind === 'let' ? Immutable.Map({ undefined: Type.undefined }) : env;
      if (typeAnnotation) {
        type = check(declarator.init, initEnv, typeAnnotation, annots);
      } else {
        type = synth(declarator.init, initEnv, annots);
      }
    } else {
      type = Error.withLocation(declarator.id, `expected initializer`, annots);
    }
    let declType =
      type.kind === 'Error' ? type :
      typeAnnotation ? typeAnnotation :
      type;

    if (decl.kind === 'let' && type.kind !== 'Error')
      declType = Type.abstract('lensType', declType);

    if (annots) annots.set(declarator.id, declType);
    if (exportTypes) exportTypes[declarator.id.name] = declType;
    env = env.set(declarator.id.name, declType);
  });
  return env;
}

function synthAndExportNamedDecl(
  decl: ESTree.ExportNamedDeclaration,
  exportTypes: { [s: string]: Type },
  env: Env,
  annots: AstAnnotations,
): Env {
  return synthVariableDecl(
    decl.declaration,
    env,
    annots,
    exportTypes,
  );
}

function exportDefaultDecl(
  decl: ESTree.ExportDefaultDeclaration,
  exportTypes: { [s: string]: Type },
  env: Env,
  annots: AstAnnotations,
) {
  exportTypes['default'] = synth(decl.declaration, env, annots);
}

export function synthProgram(
  moduleName: string,
  moduleEnv: Map<string, Type.ModuleType>,
  program: ESTree.Program,
  env: Env,
  exportTypes: { [s: string]: Type },
  annots: AstAnnotations,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        exportDefaultDecl(node, exportTypes, env, annots);
        break;

      case 'ExportNamedDeclaration':
        env = synthAndExportNamedDecl(node, exportTypes, env, annots);
        break;

      case 'ImportDeclaration':
        env = importDecl(moduleName, node, moduleEnv, env, annots);
        break;

      case 'VariableDeclaration':
        env = synthVariableDecl(node, env, annots);
        break;

      case 'ExpressionStatement':
        check(node.expression, env, Type.reactNodeType, annots);
        break;
    }
  });
  return env;
}
