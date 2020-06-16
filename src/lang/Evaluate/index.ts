import * as Immutable from 'immutable';
import * as React from 'react';
import * as ESTree from '../ESTree';
import { bug } from '../../util/bug';
import { AstAnnotations } from '../../data';

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

export function evaluateExpression(
  ast: ESTree.Expression,
  annots: AstAnnotations,
  env: Env,
): any {
  const type = annots.get(ast) ?? bug(`expected type`);
  if (type.kind === 'Error')
    return type.err;

  switch (ast.type) {
    case 'Literal':
      return ast.value;

    case 'Identifier':
      if (env.has(ast.name)) return env.get(ast.name);
      else bug(`expected value for ${ast.name}`);

    case 'JSXExpressionContainer':
      return evaluateExpression(ast.expression, annots, env);

    case 'JSXEmptyExpression':
      return undefined;

    case 'JSXText': {
      // TODO(jaked) not sure the trim here is right
      const value = ast.value.trim();
      if (value === '') return null;
      else return value;
    }

    case 'JSXElement': {
      const attrObjs = ast.openingElement.attributes.map(({ name, value }) => {
        return { [name.name]: value ? evaluateExpression(value, annots, env) : true };
      });
      const attrs = Object.assign({}, ...attrObjs);
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

      const children = ast.children.map(child => evaluateExpression(child, annots, env));
      if (typeof elem === 'function' && !isConstructor(elem))
        // TODO(jaked)
        // components defined in user code are recreated on rerenders
        // causing them to be remounted when inserted into the React tree
        // which loses focus on input elements
        // for now, apply the components so their results go in the React tree
        return elem({ ...attrs, children });
      else return React.createElement(elem, attrs, ...children);
    }

    case 'JSXFragment':
      return ast.children.map(child => evaluateExpression(child, annots, env));

    case 'UnaryExpression': {
      const v = evaluateExpression(ast.argument, annots, env);
      switch (ast.operator) {
        case '!': return !v;
        case 'typeof': return typeof v;
        default: throw new Error(`unhandled ast ${ast.operator}`);
      }
    }

    case 'LogicalExpression': {
      switch (ast.operator) {
        case '||': return evaluateExpression(ast.left, annots, env) || evaluateExpression(ast.right, annots, env);
        case '&&': return evaluateExpression(ast.left, annots, env) && evaluateExpression(ast.right, annots, env);
        default:
          throw new Error(`unexpected binary operator ${ast.operator}`)
      }
    }

    case 'BinaryExpression': {
      const lv = evaluateExpression(ast.left, annots, env);
      const rv = evaluateExpression(ast.right, annots, env);
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

    case 'SequenceExpression':
      ast.expressions.forEach((e, i) => {
        if (i < ast.expressions.length - 1)
          evaluateExpression(e, annots, env);
      });
      return evaluateExpression(ast.expressions[ast.expressions.length - 1], annots, env);

    case 'MemberExpression': {
      const object = evaluateExpression(ast.object, annots, env);
      if (ast.computed) {
        const property = evaluateExpression(ast.property, annots, env);
        return object[property];
      } else {
        if (ast.property.type !== 'Identifier')
          throw new Error('expected identifier on non-computed property');
        return object[ast.property.name];
      }
    }

    case 'CallExpression': {
      const args = ast.arguments.map(arg => evaluateExpression(arg, annots, env));
      if (ast.callee.type === 'MemberExpression') {
        const object = evaluateExpression(ast.callee.object, annots, env);
        if (ast.callee.computed) {
          const method = evaluateExpression(ast.callee.property, annots, env);
          return method.apply(object, args);
        } else {
          if (ast.callee.property.type !== 'Identifier')
            bug('expected identifier on non-computed property');
          const method = object[ast.callee.property.name];
          return method.apply(object, args);
        }
      } else {
        const callee = evaluateExpression(ast.callee, annots, env);
        return callee(...args);
      }
    }

    case 'ObjectExpression': {
      const properties = ast.properties.map(prop => {
        const value = evaluateExpression(prop.value, annots, env);
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
      return ast.elements.map(e => evaluateExpression(e, annots, env));

    case 'ArrowFunctionExpression':
      return function(...args: Array<any>) {
        ast.params.forEach((pat, i) => {
          env = patValueEnv(pat, args[i], env);
        });
        return evaluateExpression(ast.body, annots, env);
      };

    case 'ConditionalExpression': {
      const testType = annots.get(ast.test) ?? bug(`expected type`);
      if (testType.kind !== 'Error' && evaluateExpression(ast.test, annots, env)) {
        return evaluateExpression(ast.consequent, annots, env);
      } else {
        return evaluateExpression(ast.alternate, annots, env)
      }
    }

    case 'TemplateLiteral':
      // TODO(jaked) handle interpolations
      return ast.quasis.map(elem => elem.value.raw).join('');

    default:
      throw new Error('unexpected AST ' + (ast as any).type);
  }
}
