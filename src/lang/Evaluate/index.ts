import * as Immutable from 'immutable';
import * as React from 'react';
import * as ESTree from '../ESTree';
import { bug } from '../../util/bug';
import { TypesMap } from '../../model';

const STARTS_WITH_CAPITAL_LETTER = /^[A-Z]/

export type Env = Immutable.Map<string, any>;

function patValueEnvIdentifier(ast: ESTree.Identifier, value: any, env: Env): Env {
  return env.set(ast.name, value);
}

function patValueEnvObjectPattern(ast: ESTree.ObjectPattern, value: any, env: Env): Env {
  ast.properties.forEach(prop => {
    env = patValueEnv(prop.value, value[prop.key.name], env);
  });
  return env;
}

function patValueEnv(ast: ESTree.Pattern, value: any, env: Env): Env {
  if (ast.type === 'Identifier')
    return patValueEnvIdentifier(ast, value, env);
  else if (ast.type === 'ObjectPattern')
    return patValueEnvObjectPattern(ast, value, env);
  else throw new Error(`unexpected AST type ${(ast as ESTree.Pattern).type}`);
}

function isConstructor(f: any) {
  // see https://stackoverflow.com/questions/40922531/how-to-check-if-a-javascript-function-is-a-constructor
  try {
    Reflect.construct(String, [], f);
    return true;
  } catch(e) {
    return false;
  }
}

// the purpose of this wrapper is to avoid remounts when `component` changes.
// React assumes that a changed component is likely to be very different,
// so remounts the whole tree, losing the state of stateful DOM components.
// TODO(jaked) memoize on individual props?
const functionComponent = React.memo<{ component, props }>(({ component, props }) =>
  component(props)
)

export function evaluateExpression(
  ast: ESTree.Expression,
  typesMap: TypesMap,
  env: Env,
): any {
  const type = typesMap.get(ast) ?? bug(`expected type`);
  if (type.kind === 'Error')
    return undefined;

  switch (ast.type) {
    case 'Literal':
      return ast.value;

    case 'Identifier':
      if (env.has(ast.name)) return env.get(ast.name);
      else bug(`expected value for ${ast.name}`);

    case 'JSXExpressionContainer':
      return evaluateExpression(ast.expression, typesMap, env);

    case 'JSXEmptyExpression':
      return undefined;

    case 'JSXText': {
      // whitespace trimming is not specified in JSX
      // but it is necessary for components (e.g. Victory) that process their children
      // we follow Babel, see
      // https://github.com/calebmer/node_modules/tree/master/babel-plugin-transform-jsx#trimming
      // TODO(jaked) should do this in parsing insted of eval
      const value = ast.value.replace(/\n\s*/g, '')
      if (value === '') return null;
      else return value;
    }

    case 'JSXElement': {
      const attrObjs = ast.openingElement.attributes.map(({ name, value }) => {
        if (!value) return { [name.name]: true }
        else return { [name.name]: evaluateExpression(value, typesMap, env) };
      });
      const attrs = Object.assign({}, ...attrObjs);

      // TODO(jaked) maybe support bind in component lib instead of built-in
      // TODO(jaked) what if both bind and value/onChange are given?
      if (attrs['bind']) {
        const bind = attrs['bind'];
        attrs['onChange'] = (e) => bind(e.currentTarget.value);
        attrs['value'] = bind();
      }

      let elem: any;
      const name = ast.openingElement.name.name;
      if (STARTS_WITH_CAPITAL_LETTER.test(name)) {
        elem = env.get(name);
        if (typeof elem === 'undefined')
          throw new Error(`unbound identifier ${name}`);

      // TODO(jaked) figure out another way to handle internal links
      // } else if (name === 'a') {
      //   // TODO(jaked) fix hack somehow
      //   elem = env.get('Link');
      //   attrs['to'] = attrs['href']

      } else {
        elem = name;
      }

      const children = ast.children.map(child => {
        const type = typesMap.get(child) ?? bug(`expected type`);
        // TODO(jaked) undefined seems to be an acceptable ReactNode
        // in some contexts but not others; maybe we need `null` here
        return evaluateExpression(child, typesMap, env);
      });
      if (typeof elem === 'function' && !isConstructor(elem))
        return React.createElement(functionComponent, { component: elem, props: { ...attrs, children } });
      else return React.createElement(elem, attrs, ...children);
    }

    case 'JSXFragment':
      return ast.children.map(child => evaluateExpression(child, typesMap, env));

    case 'UnaryExpression': {
      const argType = typesMap.get(ast.argument) ?? bug(`expected type`);
      const v = evaluateExpression(ast.argument, typesMap, env);
      switch (ast.operator) {
        case '+': return v;
        case '-': return -v;
        case '!': return !v;
        case 'typeof': return (argType.kind === 'Error') ? 'error' : typeof v;
        default: throw new Error(`unhandled ast ${(ast as any).operator}`);
      }
    }

    case 'LogicalExpression': {
      switch (ast.operator) {
        case '||':
          return evaluateExpression(ast.left, typesMap, env) || evaluateExpression(ast.right, typesMap, env);
        case '&&':
          return evaluateExpression(ast.left, typesMap, env) && evaluateExpression(ast.right, typesMap, env);
        default:
          throw new Error(`unexpected binary operator ${(ast as any).operator}`)
      }
    }

    case 'BinaryExpression': {
      const lv = evaluateExpression(ast.left, typesMap, env);
      const rv = evaluateExpression(ast.right, typesMap, env);
      const leftType = typesMap.get(ast.left) ?? bug(`expected type`);
      const rightType = typesMap.get(ast.right) ?? bug(`expected type`);

      switch (ast.operator) {
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
          if (leftType.kind === 'Error') return rv;
          else if (rightType.kind === 'Error') return lv;
          else switch (ast.operator) {
            case '+': return lv + rv;
            case '-': return lv - rv;
            case '*': return lv * rv;
            case '/': return lv / rv;
            case '%': return lv % rv;
            default: bug(`unexpected ast.operator ${ast.operator}`);
          }

        case '===':
          if (leftType.kind === 'Error' || rightType.kind === 'Error')
            return false;
          else
            return lv === rv;

        case '!==':
          if (leftType.kind === 'Error' || rightType.kind === 'Error')
            return true;
          else
            return lv !== rv;

        default:
          throw new Error(`unexpected binary operator ${ast.operator}`)
      }
    }

    case 'SequenceExpression': {
      const values = ast.expressions.map(e =>
        evaluateExpression(e, typesMap, env)
      );
      return values[values.length - 1];
    }

    case 'MemberExpression': {
      const object = evaluateExpression(ast.object, typesMap, env);
      if (ast.computed) {
        const property = evaluateExpression(ast.property, typesMap, env);
        return object[property];
      } else {
        if (ast.property.type !== 'Identifier')
          throw new Error('expected identifier on non-computed property');
        return object[ast.property.name];
      }
    }

    case 'CallExpression': {
      const args = ast.arguments.map(arg => evaluateExpression(arg, typesMap, env));
      if (ast.callee.type === 'MemberExpression') {
        const object = evaluateExpression(ast.callee.object, typesMap, env);
        if (ast.callee.computed) {
          const method = evaluateExpression(ast.callee.property, typesMap, env);
          return method.apply(object, args);
        } else {
          if (ast.callee.property.type !== 'Identifier')
            bug('expected identifier on non-computed property');
          const method = object[ast.callee.property.name];
          return method.apply(object, args);
        }
      } else {
        const callee = evaluateExpression(ast.callee, typesMap, env);
        return callee(...args);
      }
    }

    case 'ObjectExpression': {
      const properties = ast.properties.map(prop => {
        const value = evaluateExpression(prop.value, typesMap, env);
        return { ...prop, value };
      });
      return Object.assign({}, ...properties.map(prop => {
        let name: string;
        switch (prop.key.type) {
          case 'Identifier': name = prop.key.name; break;
          case 'Literal': name = prop.key.value; break;
          default: throw new Error('expected Identifier or Literal prop key name');
        }
        return { [name]: prop.value }
      }));
    }

    case 'ArrayExpression':
      return ast.elements.map(e => evaluateExpression(e, typesMap, env));

    case 'ArrowFunctionExpression': {
      const body = ast.body;
      if (body.type === 'BlockStatement') {
        return (...args: Array<any>) => {
          ast.params.forEach((pat, i) => {
            env = patValueEnv(pat, args[i], env);
          });
          const values = body.body.map(stmt => {
            switch (stmt.type) {
              case 'ExpressionStatement':
                return evaluateExpression(stmt.expression, typesMap, env);
              default:
                bug(`unimplemented ${stmt.type}`);
            }
          });
          if (values.length === 0) return undefined;
          else return values[values.length - 1];
        }

      } else {
        return (...args: Array<any>) => {
            ast.params.forEach((pat, i) => {
              env = patValueEnv(pat, args[i], env);
            });
            return evaluateExpression(body, typesMap, env);
          };
      }
    }

    case 'ConditionalExpression': {
      if (evaluateExpression(ast.test, typesMap, env)) {
        return evaluateExpression(ast.consequent, typesMap, env);
      } else {
        return evaluateExpression(ast.alternate, typesMap, env)
      }
    }

    case 'TemplateLiteral':
      // TODO(jaked) handle interpolations
      return ast.quasis.map(elem => elem.value.raw).join('');

    default:
      throw new Error('unexpected AST ' + (ast as any).type);
  }
}
