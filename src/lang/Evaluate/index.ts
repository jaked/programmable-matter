import * as Immer from 'immer';
import * as Immutable from 'immutable';
import * as React from 'react';
import JSON5 from 'json5';
import * as ESTree from '../ESTree';
import * as PMAST from '../../model/PMAST';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as MapFuncs from '../../util/MapFuncs';
import { DynamicMap, InterfaceMap } from '../../model';
import * as Parse from '../Parse';

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

function joinDynamicExpressions(
  exprs: ESTree.Expression[],
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
  fn: (values: unknown[]) => unknown
): unknown {
  const values = exprs.map(expr => evaluateExpression(expr, interfaceMap, dynamicMap, env));
  const dynamics = exprs.map(expr => dynamicMap.get(expr) ?? bug(`expected dynamic`));
  const signals = values.filter((value, i) => dynamics[i]) as Signal<unknown>[];
  switch (signals.length) {
    case 0:
      return fn(values);

    case 1:
      return signals[0].map(signalValue => {
        const allValues = dynamics.map((dynamic, i) => {
          if (dynamic) {
            return signalValue;
          } else {
            return values[i];
          }
        });
        return fn(allValues);
      });

    default: {
      return Signal.join(...signals).map(signalValues => {
        const allValues = dynamics.map((dynamic, i) => {
          if (dynamic) {
            return signalValues.shift();
          } else {
            return values[i];
          }
        });
        return fn(allValues);
      });
    }
  }
}

export function evaluateExpression(
  ast: ESTree.Expression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): unknown {
  const intf = interfaceMap.get(ast) ?? bug(`expected type`);
  if (intf.type === 'err')
    return undefined;
  if (intf.ok.type.kind === 'Error')
    return undefined;

  switch (ast.type) {
    case 'Literal':
      return ast.value;

    case 'Identifier':
    case 'JSXIdentifier':
      if (env.has(ast.name)) return env.get(ast.name);
      else bug(`expected value for ${ast.name}`);

    case 'JSXExpressionContainer':
      return evaluateExpression(ast.expression, interfaceMap, dynamicMap, env);

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
      const exprs: ESTree.Expression[] = [];
      ast.openingElement.attributes.forEach(({ value }) => { if (value) exprs.push(value) });
      exprs.push(ast.openingElement.name);
      exprs.push(...ast.children);

      return joinDynamicExpressions(
        exprs,
        interfaceMap,
        dynamicMap,
        env,
        values =>  {
          const attrObjs = ast.openingElement.attributes.map(({ name, value }) => {
            if (!value) return { [name.name]: true }
            else return { [name.name]: values.shift() };
          });
          const attrs = Object.assign({}, ...attrObjs);

          // TODO(jaked) maybe support bind in component lib instead of built-in
          // TODO(jaked) what if both bind and value/onChange are given?
          if (attrs['bind']) {
            const bind = attrs['bind'];
            attrs['onChange'] = (e) => bind(e.currentTarget.value);
            attrs['value'] = bind();
          }

          const elem = values.shift() as any;

          const children = ast.children.map(child => values.shift() as React.ReactNode);

          if (typeof elem === 'function' && !isConstructor(elem))
            return React.createElement(functionComponent, { component: elem, props: { ...attrs, children } });
          else return React.createElement(elem, attrs, ...children);
        }
      );
    }

    case 'JSXFragment':
      return joinDynamicExpressions(
        ast.children,
        interfaceMap,
        dynamicMap,
        env,
        values => values
      );

    case 'UnaryExpression':
      return joinDynamicExpressions(
        [ast.argument],
        interfaceMap,
        dynamicMap,
        env,
        ([v]) => {
          const argIntf = interfaceMap.get(ast.argument) ?? bug(`expected type`);
          switch (ast.operator) {
            case '+': return v;
            case '-': return -(v as number);
            case '!': return !v;
            case 'typeof': return (argIntf.type === 'err') ? 'error' : typeof v;
            default: throw new Error(`unhandled ast ${(ast as any).operator}`);
          }
        }
      );

    case 'LogicalExpression': {
      // when either left or right is dynamic the whole expression is dynamic
      // but only evaluate right if needed
      const leftDynamic = dynamicMap.get(ast.left) ?? bug(`expected dynamic`);
      const rightDynamic = dynamicMap.get(ast.right) ?? bug(`expected dynamic`);
      const fn = (left: unknown) => {
        switch (ast.operator) {
          case '||':
            if (left) return rightDynamic ? Signal.ok(left) : left;
            else return evaluateExpression(ast.right, interfaceMap, dynamicMap, env);
          case '&&':
            if (!left) return rightDynamic ? Signal.ok(left) : left;
            else return evaluateExpression(ast.right, interfaceMap, dynamicMap, env);
          default:
            bug(`unimplemented ${(ast as any).operator}`);
        }
      }
      const left = evaluateExpression(ast.left, interfaceMap, dynamicMap, env);
      if (leftDynamic && rightDynamic) {
        return (left as Signal<unknown>).flatMap(fn as (left: unknown) => Signal<unknown>);
      } else if (leftDynamic) {
        return (left as Signal<unknown>).map(fn);
      } else {
        return fn(left);
      }
    }

    case 'BinaryExpression':
      return joinDynamicExpressions(
        [ast.left, ast.right],
        interfaceMap,
        dynamicMap,
        env,
        ([lv, rv]) => {
          const leftIntf = interfaceMap.get(ast.left) ?? bug(`expected type`);
          const rightIntf = interfaceMap.get(ast.right) ?? bug(`expected type`);

          switch (ast.operator) {
            case '+':
            case '-':
            case '*':
            case '/':
            case '%':
              if (leftIntf.type === 'err') return rv;
              else if (rightIntf.type === 'err') return lv;
              else {
                const lvn = lv as number;
                const rvn = rv as number;
                switch (ast.operator) {
                  case '+': return lvn + rvn;
                  case '-': return lvn - rvn;
                  case '*': return lvn * rvn;
                  case '/': return lvn / rvn;
                  case '%': return lvn % rvn;
                  default: bug(`unexpected ast.operator ${ast.operator}`);
                }
              }

            case '===':
              if (leftIntf.type === 'err' || rightIntf.type === 'err')
                return false;
              else
                return lv === rv;

            case '!==':
              if (leftIntf.type === 'err' || rightIntf.type === 'err')
                return true;
              else
                return lv !== rv;

            default:
              throw new Error(`unexpected binary operator ${ast.operator}`)
          }
        }
      );

    case 'SequenceExpression':
      return joinDynamicExpressions(
        ast.expressions,
        interfaceMap,
        dynamicMap,
        env,
        values => values[values.length - 1]
      );

    case 'MemberExpression':
      if (ast.computed) {
        return joinDynamicExpressions(
          [ast.object, ast.property],
          interfaceMap,
          dynamicMap,
          env,
          ([object, property]) => (object as object)[property as (string | number)]
        );
      } else {
        if (ast.property.type !== 'Identifier') bug(`expected Identifier`);
        const name = ast.property.name;
        return joinDynamicExpressions(
          [ast.object],
          interfaceMap,
          dynamicMap,
          env,
          ([object]) => (object as object)[name]
        );
      }

    case 'CallExpression': {
      const exprs: ESTree.Expression[] = [];
      exprs.push(...ast.arguments);
      if (ast.callee.type === 'MemberExpression') {
        exprs.push(ast.callee.object);
        if (ast.callee.computed) {
          exprs.push(ast.callee.property);
        }
      } else {
        exprs.push(ast.callee);
      }

      return joinDynamicExpressions(
        exprs,
        interfaceMap,
        dynamicMap,
        env,
        values => {
          const args = ast.arguments.map(arg => values.shift());
          if (ast.callee.type === 'MemberExpression') {
            // need to uncover the object on which we're calling the method
            // in order to pass it as the `this` param to `apply`
            const object = values.shift() as object;
            if (ast.callee.computed) {
              const property = values.shift() as (string | number);
              const method = object[property];
              return method.apply(object, args);
            } else {
              if (ast.callee.property.type !== 'Identifier') bug(`expected Identifier`);
              const method = object[ast.callee.property.name];
              return method.apply(object, args);
            }
          } else {
            const callee = values.shift() as any;
            return callee(...args);
          }
        }
      );
    }

    case 'ObjectExpression':
      return joinDynamicExpressions(
        ast.properties.map(prop => prop.value),
        interfaceMap,
        dynamicMap,
        env,
        values => {
          const properties = ast.properties.map(prop => {
            const value = values.shift();
            return { ...prop, value };
          });
          return Object.assign({}, ...properties.map(prop => {
            let name: string;
            switch (prop.key.type) {
              case 'Identifier': name = prop.key.name; break;
              case 'Literal': name = prop.key.value; break;
              default: bug('expected Identifier or Literal');
            }
            return { [name]: prop.value }
          }));
        }
      );

    case 'ArrayExpression':
      return joinDynamicExpressions(
        ast.elements,
        interfaceMap,
        dynamicMap,
        env,
        values => values
      );

    case 'ArrowFunctionExpression': {
      const body = ast.body;
      let fn;
      if (body.type === 'BlockStatement') {
        fn = (...args: Array<any>) => {
          ast.params.forEach((pat, i) => {
            env = patValueEnv(pat, args[i], env);
          });
          const values = body.body.map(stmt => {
            switch (stmt.type) {
              case 'ExpressionStatement':
                return evaluateExpression(stmt.expression, interfaceMap, dynamicMap, env);
              default:
                bug(`unimplemented ${stmt.type}`);
            }
          });
          if (values.length === 0) return undefined;
          else return values[values.length - 1];
        }

      } else {
        fn = (...args: Array<any>) => {
          ast.params.forEach((pat, i) => {
            env = patValueEnv(pat, args[i], env);
          });
          return evaluateExpression(body, interfaceMap, dynamicMap, env);
        };
      }

      // if the function depends on dynamic values return a dynamic function value
      // the function itself doesn't change, but a fresh instance is created
      // in order to cause React reconciliation etc.
      // inside the function, we get() the function value
      // to cause Signal reconciliation and produce a non-Signal value
      const dynamic = dynamicMap.get(ast) ?? bug(`expected dynamic`);
      if (dynamic) {
        const idents = ESTree.freeIdentifiers(ast).filter(ident => {
          // happens when an unbound identifier is used
          if (!dynamicMap.has(ident)) return false;
          // happens when an identifier is used in its own definition
          if (!env.has(ident.name)) return false;
          // TODO(jaked) check for these cases explicitly
          // so we don't hit them for an actual bug
          return dynamicMap.get(ident) ?? bug(`expected dynamic`);
        });
        const signals = idents.map(ident =>
          evaluateExpression(ident, interfaceMap, dynamicMap, env) as Signal<unknown>
        );
        return Signal.join(...signals).map(() =>
          (...args: Array<any>) => fn(...args).get()
        );
      } else {
        return fn;
      }
    }

    case 'ConditionalExpression': {
      const testDynamic = dynamicMap.get(ast.test) ?? bug(`expected dynamic`);
      const consequentDynamic = dynamicMap.get(ast.consequent) ?? bug(`expected dynamic`);
      const alternateDynamic = dynamicMap.get(ast.alternate) ?? bug(`expected dynamic`);

      const fn = (test : unknown) => {
        if (test) {
          const consequent = evaluateExpression(ast.consequent, interfaceMap, dynamicMap, env);
          return (alternateDynamic && !consequentDynamic) ? Signal.ok(consequent) : consequent;
        } else {
          const alternate = evaluateExpression(ast.alternate, interfaceMap, dynamicMap, env)
          return (consequentDynamic && !alternateDynamic) ? Signal.ok(alternate) : alternate;
        }
      };
      const test = evaluateExpression(ast.test, interfaceMap, dynamicMap, env);
      if (testDynamic && (consequentDynamic || alternateDynamic)) {
        return (test as Signal<unknown>).flatMap(fn as (test: unknown) => Signal<unknown>);
      } else if (testDynamic) {
        return (test as Signal<unknown>).map(fn);
      } else {
        return fn(test);
      }
    }

    case 'TemplateLiteral':
      // TODO(jaked) handle interpolations
      return ast.quasis.map(elem => elem.value.raw).join('');

    case 'AssignmentExpression': {
      const leftIntf = interfaceMap.get(ast.left) ?? bug(`expected type`);
      const rightIntf = interfaceMap.get(ast.right) ?? bug(`expected type`);
      if (leftIntf.type === 'err' || rightIntf.type === 'err') {
        // TODO(jaked) we should return rhs when it's OK I think
        return undefined;
      } else {
        const props: (string | null)[] = [];
        const exprs: ESTree.Expression[] = [ast.right];
        let object = ast.left;
        while (object.type === 'MemberExpression') {
          if (object.computed) {
            props.unshift(null);
            exprs.unshift(object.property);
          } else {
            if (object.property.type !== 'Identifier') bug(`expected Identifier`);
            props.unshift(object.property.name);
          }
          object = object.object;
        }
        exprs.unshift(object);
        return joinDynamicExpressions(
          exprs,
          interfaceMap,
          dynamicMap,
          env,
          values => {
            const object = values.shift();
            const right = values.pop();
            if (props.length === 0) {
              (object as Signal.Writable<unknown>).setOk(right);
            } else {
              (object as Signal.Writable<object>).produce(object => {
                while (props.length > 1) {
                  let prop = props.shift() || values.shift() as string;
                  object = object[prop];
                }
                let prop = props.shift() || values.shift() as string;
                object[prop] = right;
              });
            }
            return right;
          }
        )
      }
    }

    case 'TSAsExpression':
      return evaluateExpression(ast.expression, interfaceMap, dynamicMap, env);

    default:
      throw new Error('unexpected AST ' + (ast as any).type);
  }
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  moduleDynamicEnv: Map<string, Map<string, boolean>>,
  moduleValueEnv: Map<string, Map<string, unknown>>,
  interfaceMap: InterfaceMap,
  valueEnv: Env,
): Env {
  // TODO(jaked) finding errors in the AST is delicate.
  // need to separate error semantics from error highlighting.
  const intf = interfaceMap.get(decl.source);
  if (intf && intf.type === 'err') {
    const err = intf.err;
    decl.specifiers.forEach(spec => {
      valueEnv = valueEnv.set(spec.local.name, err);
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
          const intf = interfaceMap.get(spec.local);
          if (!intf || intf.type !== 'err') {
            const defaultField = moduleValue.get('default') ?? bug(`expected default`);
            valueEnv = valueEnv.set(spec.local.name, defaultField);
          }
        }
        break;

        case 'ImportSpecifier': {
          const intf = interfaceMap.get(spec.imported);
          if (!intf || intf.type !== 'err') {
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  valueEnv: Env,
): Env {
  switch (decl.kind) {
    case 'const': {
      decl.declarations.forEach(declarator => {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const value = evaluateExpression(declarator.init, interfaceMap, dynamicMap, valueEnv);
        valueEnv = valueEnv.set(name, value);
      });
    }
    break;

    case 'let': {
      decl.declarations.forEach(declarator => {
        let name = declarator.id.name;
        const cellIntf = interfaceMap.get(declarator.id) ?? bug(`expected type`);
        if (cellIntf.type === 'err') return valueEnv;
        else if (cellIntf.ok.type.kind !== 'Abstract' || cellIntf.ok.type.params.size !== 1) bug(`expected Code<T> or Session<T>`);
        const init = declarator.init;
        const value = evaluateExpression(init, interfaceMap, dynamicMap, Immutable.Map({ undefined: undefined }));
        if (cellIntf.ok.type.label === 'Code') {
          // TODO(jaked) this is an abuse of mapWritable, maybe add a way to make Signals from arbitrary functions?
          valueEnv = valueEnv.set(name, nodes.mapWritable(
            _ => value,
            v => Immer.produce(nodes.get(), nodes => {
              function walk(nodes: PMAST.Node[]): boolean {
                for (let i = 0; i < nodes.length; i++) {
                  const oldNode = nodes[i];
                  if (Immer.original(oldNode) === node) {
                    const code =
                      (node.children[0] && PMAST.isText(node.children[0]) && node.children[0].text) ||
                      bug(`expected text child`);
                    const newNode: PMAST.Node = { type: 'code', children: [{ text:
                      code.substr(0, init.start) + JSON5.stringify(v, undefined, 2) + code.substr(init.end)
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
              // TODO(jaked)
              // what if changing node invalidates selection?
              // how can we avoid recompiling the note / dependents?
              //   put a cell in the environment so we can update it
              //   Signal.Writable that writes back to node?
            })
          ));

        } else if (cellIntf.ok.type.label === 'Session') {
          valueEnv = valueEnv.set(name, Signal.cellOk(value));

        } else bug(`unexpected ${cellIntf.ok.type.label}`);
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  moduleDynamicEnv: Map<string, Map<string, boolean>>,
  moduleValueEnv: Map<string, Map<string, unknown>>,
  valueEnv: Env,
): Env {
  const code = Parse.parseCodeNode(node);
  code.forEach(code => {
    for (const decl of code.body) {
      switch (decl.type) {
        case 'ImportDeclaration':
          valueEnv = importDecl(decl, moduleDynamicEnv, moduleValueEnv, interfaceMap, valueEnv);
          break;

        case 'ExportNamedDeclaration':
          valueEnv = evalVariableDecl(nodes, node, decl.declaration, interfaceMap, dynamicMap, valueEnv);
          break;

        case 'ExportDefaultDeclaration': {
          const value = evaluateExpression(decl.declaration, interfaceMap, dynamicMap, valueEnv);
          valueEnv = valueEnv.set('default', value);
        }
        break;

        case 'VariableDeclaration':
          valueEnv = evalVariableDecl(nodes, node, decl, interfaceMap, dynamicMap, valueEnv);
          break;
      }
    }
  });
  return valueEnv;
}
