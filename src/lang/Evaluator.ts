import * as Immutable from 'immutable';
import * as React from 'react';
import * as ESTree from './ESTree';

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

export function evaluateExpression(
  ast: ESTree.Expression,
  env: Env,
): any {
  switch (ast.type) {
    case 'Literal':
      return ast.value;

    case 'Identifier':
      if (env.has(ast.name)) return env.get(ast.name);
      else if (ast.name === 'undefined') return undefined;
      else throw new Error(`unbound identifier ${ast.name}`);

    case 'JSXExpressionContainer':
      return evaluateExpression(ast.expression, env);

    case 'JSXText': {
      const value = ast.value.trim();
      if (value === '') return null;
      else return value;
    }

    case 'JSXElement': {
      const attrObjs = ast.openingElement.attributes.map(({ name, value }) => {
        return { [name.name]: evaluateExpression(value, env) };
      });
      const attrs = Object.assign({}, ...attrObjs);

      let elem: any;
      const name = ast.openingElement.name.name;
      if (STARTS_WITH_CAPITAL_LETTER.test(name)) {
        elem = env.get(name);
        if (typeof elem === 'undefined')
          throw new Error(`unbound identifier ${name}`);
      } else if (name === 'a') {
        // TODO(jaked) fix hack somehow
        elem = env.get('Link');
        attrs['to'] = attrs['href']
      } else {
        elem = name;
      }

      const children = ast.children.map(child => evaluateExpression(child, env));
      return React.createElement(elem, attrs, ...children)
    }

    case 'JSXFragment':
      return ast.children.map(child => evaluateExpression(child, env));

    case 'UnaryExpression': {
      const v = evaluateExpression(ast.argument, env);
      switch (ast.operator) {
        case '!': return !v;
        case 'typeof': return typeof v;
        default: throw new Error(`unhandled ast ${ast.operator}`);
      }
    }

    case 'LogicalExpression': {
      // TODO(jaked) short-circuit booleans
      const lv = evaluateExpression(ast.left, env);
      const rv = evaluateExpression(ast.right, env);
      switch (ast.operator) {
        case '||': return lv || rv;
        case '&&': return lv && rv;
        default:
          throw new Error(`unexpected binary operator ${ast.operator}`)
      }
    }

    case 'BinaryExpression': {
      const lv = evaluateExpression(ast.left, env);
      const rv = evaluateExpression(ast.right, env);
      switch (ast.operator) {
        case '+': return lv + rv;
        case '-': return lv - rv;
        case '*': return lv * rv;
        case '/': return lv / rv;
        case '**': return lv ** rv;
        case '%': return lv % rv;
        case '==': return lv == rv;
        case '!=': return lv != rv;
        case '===': return lv === rv;
        case '!==': return lv !== rv;
        case '<': return lv < rv;
        case '<=': return lv <= rv;
        case '>': return lv > rv;
        case '>=': return lv >= rv;
        case '|': return lv | rv;
        case '&': return lv & rv;
        case '^': return lv ^ rv;
        case '<<': return lv << rv;
        case '>>': return lv >> rv;
        case '>>>': return lv >>> rv;
        default:
          throw new Error(`unexpected binary operator ${ast.operator}`)
      }
    }

    case 'MemberExpression': {
      const object = evaluateExpression(ast.object, env);
      if (ast.computed) {
        const property = evaluateExpression(ast.property, env);
        return object[property];
      } else {
        if (ast.property.type !== 'Identifier')
          throw new Error('expected identifier on non-computed property');
        return object[ast.property.name];
      }
    }

    case 'CallExpression': {
      const callee = evaluateExpression(ast.callee, env);
      const args = ast.arguments.map(arg => evaluateExpression(arg, env));
      return callee(args);
    }

    case 'ObjectExpression': {
      const properties = ast.properties.map(prop => {
        const value = evaluateExpression(prop.value, env);
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
      return ast.elements.map(e => evaluateExpression(e, env));

    case 'ArrowFunctionExpression':
      return function(...args: Array<any>) {
        ast.params.forEach((pat, i) => {
          env = patValueEnv(pat, args[i], env);
        });
        return evaluateExpression(ast.body, env);
      };

    case 'ConditionalExpression':
      if (evaluateExpression(ast.test, env)) {
        return evaluateExpression(ast.consequent, env);
      } else {
        return evaluateExpression(ast.alternate, env)
      }

    case 'TemplateLiteral':
      // TODO(jaked) handle interpolations
      return ast.quasis.map(elem => elem.value.raw).join('');

    default:
      throw new Error('unexpected AST ' + (ast as any).type);
  }
}
