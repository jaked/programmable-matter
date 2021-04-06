import * as Immer from 'immer';
import * as Immutable from 'immutable';
import * as React from 'react';
import JSON5 from 'json5';
import * as ESTree from '../ESTree';
import * as PMAST from '../../model/PMAST';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as MapFuncs from '../../util/MapFuncs';
import { TypeMap } from '../../model';
import * as Parse from '../Parse';
import * as Dyncheck from '../Dyncheck';
import lensValue from '../Compile/lensValue';

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
  typeMap: TypeMap,
  env: Env,
): any {
  const type = typeMap.get(ast) ?? bug(`expected type`);
  if (type.kind === 'Error')
    return undefined;

  switch (ast.type) {
    case 'Literal':
      return ast.value;

    case 'Identifier':
      if (env.has(ast.name)) return env.get(ast.name);
      else bug(`expected value for ${ast.name}`);

    case 'JSXExpressionContainer':
      return evaluateExpression(ast.expression, typeMap, env);

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
        else return { [name.name]: evaluateExpression(value, typeMap, env) };
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
        // TODO(jaked) undefined seems to be an acceptable ReactNode
        // in some contexts but not others; maybe we need `null` here
        return evaluateExpression(child, typeMap, env);
      });
      if (typeof elem === 'function' && !isConstructor(elem))
        return React.createElement(functionComponent, { component: elem, props: { ...attrs, children } });
      else return React.createElement(elem, attrs, ...children);
    }

    case 'JSXFragment':
      return ast.children.map(child => evaluateExpression(child, typeMap, env));

    case 'UnaryExpression': {
      const argType = typeMap.get(ast.argument) ?? bug(`expected type`);
      const v = evaluateExpression(ast.argument, typeMap, env);
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
          return evaluateExpression(ast.left, typeMap, env) || evaluateExpression(ast.right, typeMap, env);
        case '&&':
          return evaluateExpression(ast.left, typeMap, env) && evaluateExpression(ast.right, typeMap, env);
        default:
          throw new Error(`unexpected binary operator ${(ast as any).operator}`)
      }
    }

    case 'BinaryExpression': {
      const lv = evaluateExpression(ast.left, typeMap, env);
      const rv = evaluateExpression(ast.right, typeMap, env);
      const leftType = typeMap.get(ast.left) ?? bug(`expected type`);
      const rightType = typeMap.get(ast.right) ?? bug(`expected type`);

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
        evaluateExpression(e, typeMap, env)
      );
      return values[values.length - 1];
    }

    case 'MemberExpression': {
      const object = evaluateExpression(ast.object, typeMap, env);
      if (ast.computed) {
        const property = evaluateExpression(ast.property, typeMap, env);
        return object[property];
      } else {
        if (ast.property.type !== 'Identifier')
          throw new Error('expected identifier on non-computed property');
        return object[ast.property.name];
      }
    }

    case 'CallExpression': {
      const args = ast.arguments.map(arg => evaluateExpression(arg, typeMap, env));
      if (ast.callee.type === 'MemberExpression') {
        const object = evaluateExpression(ast.callee.object, typeMap, env);
        if (ast.callee.computed) {
          const method = evaluateExpression(ast.callee.property, typeMap, env);
          return method.apply(object, args);
        } else {
          if (ast.callee.property.type !== 'Identifier')
            bug('expected identifier on non-computed property');
          const method = object[ast.callee.property.name];
          return method.apply(object, args);
        }
      } else {
        const callee = evaluateExpression(ast.callee, typeMap, env);
        return callee(...args);
      }
    }

    case 'ObjectExpression': {
      const properties = ast.properties.map(prop => {
        const value = evaluateExpression(prop.value, typeMap, env);
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
      return ast.elements.map(e => evaluateExpression(e, typeMap, env));

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
                return evaluateExpression(stmt.expression, typeMap, env);
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
            return evaluateExpression(body, typeMap, env);
          };
      }
    }

    case 'ConditionalExpression': {
      if (evaluateExpression(ast.test, typeMap, env)) {
        return evaluateExpression(ast.consequent, typeMap, env);
      } else {
        return evaluateExpression(ast.alternate, typeMap, env)
      }
    }

    case 'TemplateLiteral':
      // TODO(jaked) handle interpolations
      return ast.quasis.map(elem => elem.value.raw).join('');

    default:
      throw new Error('unexpected AST ' + (ast as any).type);
  }
}

export function evaluateDynamicExpression(
  ast: ESTree.Expression,
  typeMap: TypeMap,
  dynamicEnv: Dyncheck.Env,
  valueEnv: Env,
): { value: unknown, dynamic: boolean } {
  const type = typeMap.get(ast) ?? bug(`expected type`);
  if (type.kind === 'Error') return { value: undefined, dynamic: false };
  const idents = ESTree.freeIdentifiers(ast).filter(ident => {
    // happens when an unbound identifier is used
    if (!dynamicEnv.has(ident)) return false;
    // happens when an identifier is used in its own definition
    if (!valueEnv.has(ident)) return false;
    // TODO(jaked) check for these cases explicitly
    // so we don't hit them for an actual bug
    return dynamicEnv.get(ident) ?? bug(`expected dynamic`);
  });
  const signals = idents.map(id =>
    (valueEnv.get(id) as Signal<unknown>) ?? bug(`expected signal`)
  );
  switch (signals.length) {
    case 0:
      return {
        value: evaluateExpression(ast, typeMap, valueEnv),
        dynamic: false
      };
    case 1:
      return {
        value: signals[0].map(value => {
          const valueEnv2 = valueEnv.set(idents[0], value);
          return evaluateExpression(ast, typeMap, valueEnv2);
        }),
        dynamic: true
      };
    default:
      return {
        value: Signal.join(...signals).map(values => {
          const valueEnv2 = valueEnv.concat(Immutable.Map(idents.map((id, i) => [id, values[i]])));
          return evaluateExpression(ast, typeMap, valueEnv2);
        }),
        dynamic: true
      };
  }
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  moduleDynamicEnv: Map<string, Map<string, boolean>>,
  moduleValueEnv: Map<string, Map<string, unknown>>,
  typeMap: TypeMap,
  valueEnv: Env,
): Env {
  // TODO(jaked) finding errors in the AST is delicate.
  // need to separate error semantics from error highlighting.
  const type = typeMap.get(decl.source);
  if (type && type.kind === 'Error') {
    decl.specifiers.forEach(spec => {
      valueEnv = valueEnv.set(spec.local.name, type.err);
    });
  } else {
    const moduleValue = moduleValueEnv.get(decl.source.value) ?? bug(`expected moduleValue`);
    const moduleDynamic = moduleDynamicEnv.get(decl.source.value) ?? bug(`expected moduleDynamic`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          // TODO(jaked) carry dynamic flags in Type.ModuleType
          // so we can distinguish dynamic/static module members at the point of use
          // for now if any member is dynamic the whole module is dynamic, else static
          let value;
          if ([...moduleDynamic.values()].some(dynamic => dynamic)) {
            value = Signal.joinMap(Signal.ok(MapFuncs.map(moduleValue, (v, k) => {
              if (moduleDynamic.get(k) ?? bug(`expected dynamic`))
                return v as Signal<unknown>;
              else
                return Signal.ok(v);
            })))
              .map(moduleValue => Object.fromEntries(moduleValue.entries()));
          } else {
            value = Object.fromEntries(moduleValue.entries());
          }
          valueEnv = valueEnv.set(spec.local.name, value);
          break;
        }

        case 'ImportDefaultSpecifier': {
          const type = typeMap.get(spec.local);
          if (!type || type.kind !== 'Error') {
            const defaultField = moduleValue.get('default') ?? bug(`expected default`);
            valueEnv = valueEnv.set(spec.local.name, defaultField);
          }
        }
        break;

        case 'ImportSpecifier': {
          const type = typeMap.get(spec.imported);
          if (!type || type.kind !== 'Error') {
            const importedField = moduleValue.get(spec.imported.name) ?? bug(`expected ${spec.imported.name}`);
            valueEnv = valueEnv.set(spec.local.name, importedField);
          }
        }
        break;
      }
    });
  }
  return valueEnv;
}

function evalVariableDecl(
  nodes: Signal.Writable<PMAST.Node[]>,
  node: PMAST.Code,
  decl: ESTree.VariableDeclaration,
  typeMap: TypeMap,
  dynamicEnv: Dyncheck.Env,
  valueEnv: Env,
): Env {
  switch (decl.kind) {
    case 'const': {
      decl.declarations.forEach(declarator => {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const { value } = evaluateDynamicExpression(declarator.init, typeMap, dynamicEnv, valueEnv);
        valueEnv = valueEnv.set(name, value);
      });
    }
    break;

    case 'let': {
      decl.declarations.forEach(declarator => {
        let name = declarator.id.name;
        const lensType = typeMap.get(declarator.id) ?? bug(`expected type`);
        if (lensType.kind === 'Error') return valueEnv;
        else if (lensType.kind !== 'Abstract' || lensType.params.size !== 1) bug(`expected lensType`);
        const type = lensType.params.get(0) ?? bug(`expected param`);
        const init = declarator.init;
        const value = evaluateExpression(init, typeMap, Immutable.Map({ undefined: undefined }));
        const setValue = (v) => {
          nodes.produce(nodes => {
            function walk(nodes: PMAST.Node[]): boolean {
              for (let i = 0; i < nodes.length; i++) {
                const oldNode = nodes[i];
                if (Immer.original(oldNode) === node) {
                  const code =
                    (node.children[0] && PMAST.isText(node.children[0]) && node.children[0].text) ||
                    bug(`expected text child`);
                  const newNode: PMAST.Node = { type: 'code', children: [{ text:
                    code.substr(0, init.start) + JSON5.stringify(v) + code.substr(init.end)
                  }]};
                  nodes[i] = newNode;
                  return true;
                } else if (PMAST.isElement(oldNode)) {
                  if (walk(oldNode.children)) {
                    return true;
                  }
                }
              }
              return false;
            }

            if (!walk(nodes)) bug(`expected node`);
          });
          // TODO(jaked)
          // what if changing node invalidates selection?
          // how can we avoid recompiling the note / dependents?
          //   put a cell in the environment so we can update it
          //   Signal.Writable that writes back to node?
        }
        const lens = lensValue(value, setValue, type);
        valueEnv = valueEnv.set(name, lens);
      });
    }
    break;

    default: throw new Error('unexpected AST ' + decl.kind);
  }
  return valueEnv;
}

export function evaluateCodeNode(
  nodes: Signal.Writable<PMAST.Node[]>,
  node: PMAST.Code,
  typeMap: TypeMap,
  moduleDynamicEnv: Map<string, Map<string, boolean>>,
  moduleValueEnv: Map<string, Map<string, unknown>>,
  dynamicEnv: Dyncheck.Env,
  valueEnv: Env,
): Env {
  const code = Parse.parseCodeNode(node);
  code.forEach(code => {
    for (const decl of code.body) {
      switch (decl.type) {
        case 'ImportDeclaration':
          valueEnv = importDecl(decl, moduleDynamicEnv, moduleValueEnv, typeMap, valueEnv);
          break;

        case 'ExportNamedDeclaration':
          valueEnv = evalVariableDecl(nodes, node, decl.declaration, typeMap, dynamicEnv, valueEnv);
          break;

        case 'ExportDefaultDeclaration': {
          const { value } = evaluateDynamicExpression(decl.declaration, typeMap, dynamicEnv, valueEnv);
          valueEnv = valueEnv.set('default', value);
        }
        break;

        case 'VariableDeclaration':
          valueEnv = evalVariableDecl(nodes, node, decl, typeMap, dynamicEnv, valueEnv);
          break;
      }
    }
  });
  return valueEnv;
}
