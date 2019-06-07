import * as Immutable from 'immutable';

import * as AcornJsxAst from '../lang/acornJsxAst';

function makeLiteral(ast: AcornJsxAst.Expression, value: any) {
  return Object.assign({}, ast, { type: 'Literal', value });
}

export type AtomName = Immutable.Record<{ module: string | null, name: string }>;
export type AtomNames = Immutable.Set<AtomName>;

const AtomName = Immutable.Record<{ module: string | null, name: string }>({ module: null, name: '' });

export type Env = Immutable.Map<string, any>;

// TODO(jaked)
// it seems like we should be able to drop `mode` and use the presence /
// absence of fields to refine the type (e.g. `if (names)`), but TS
// complains that the field doesn't exist on both arms.
export type Opts =
  {
    mode: 'compile',
    module: string,
    atomNames: AtomNames,
    renderJsxElement: (e: AcornJsxAst.JSXElement) => any
  } |
  {
    mode: 'run',
    env: Env
  }

// evaluate an expression
//  - when `names` is passed, leave identifiers unevaluated but add them to `names`
//  - when `env` is passed, look up identifiers in `env`
// so we can use this function both in compilation and at runtime
export function evaluateExpression(
  ast: AcornJsxAst.Expression,
  opts: Opts
): AcornJsxAst.Expression {
  switch (ast.type) {
    case 'Literal': return ast;

    case 'Identifier':
      if (opts.mode === 'compile') {
        if (ast.atom) {
          opts.atomNames =
            opts.atomNames.add(AtomName({ module: null, name: ast.name }));
        }
        return ast;
      } else {
        return makeLiteral(ast, opts.env.get(ast.name));
      }

    case 'JSXElement':
      switch (opts.mode) {
        case 'compile':
          // we don't need to recurse into JSXElements;
          // focal handles reaction inside nested elements
          return makeLiteral(ast, opts.renderJsxElement(ast));
        default:
          throw new Error('unexpected JSXElement at runtime');
      }

    case 'BinaryExpression': {
      const left = evaluateExpression(ast.left, opts);
      const right = evaluateExpression(ast.right, opts);
      if (left.type === 'Literal' && right.type === 'Literal') {
        const lv = left.value;
        const rv = right.value;
        let v;
        switch (ast.operator) {
          case '+': v = lv + rv; break;
          case '-': v = lv - rv; break;
          case '*': v = lv * rv; break;
          case '/': v = lv / rv; break;
          case '**': v = lv ** rv; break;
          case '%': v = lv % rv; break;
          case '==': v = lv == rv; break;
          case '!=': v = lv != rv; break;
          case '===': v = lv === rv; break;
          case '!==': v = lv !== rv; break;
          case '<': v = lv < rv; break;
          case '<=': v = lv <= rv; break;
          case '>': v = lv > rv; break;
          case '>=': v = lv >= rv; break;
          case '||': v = lv || rv; break;
          case '&&': v = lv && rv; break;
          case '|': v = lv | rv; break;
          case '&': v = lv & rv; break;
          case '^': v = lv ^ rv; break;
          case '<<': v = lv << rv; break;
          case '>>': v = lv >> rv; break;
          case '>>>': v = lv >>> rv; break;
        }
        return makeLiteral(ast, v);
      } else {
        return Object.assign({}, ast, { left, right });
      }
    }

    case 'MemberExpression': {
      if (!ast.object.etype)
        throw new Error('expected AST to be typechecked');
      if (ast.object.etype.kind === 'Module') {
        if (ast.object.type !== 'Identifier')
          throw new Error('expected identifier for module');
        if (ast.property.type !== 'Identifier')
          throw new Error('expected identifier for module property');
        const module = ast.object.name;
        const name = ast.property.name;
        if (opts.mode === 'compile') {
          if (ast.atom) {
            opts.atomNames =
              opts.atomNames.add(AtomName({ module, name }))
          }
          return ast;
        } else {
          return makeLiteral(ast, opts.env.get(module)[name]);
        }
      } else {
        const object = evaluateExpression(ast.object, opts);
        if (ast.computed) {
          const property = evaluateExpression(ast.property, opts);
          if (object.type === 'Literal' && property.type === 'Literal') {
            return makeLiteral(ast, object.value[property.value]);
          } else {
            return Object.assign({}, ast, { object, property });
          }
        } else {
          if (ast.property.type !== 'Identifier')
            throw new Error('expected identifier on non-computed property');
          if (object.type === 'Literal') {
            return makeLiteral(ast, object.value[ast.property.name]);
          } else {
            return Object.assign({}, ast, { object });
          }
        }
      }
    }

    case 'ObjectExpression': {
      const properties = ast.properties.map(prop => {
        const value = evaluateExpression(prop.value, opts);
        return Object.assign({}, prop, { value })
      });
      if (properties.every((prop) => prop.value.type === 'Literal')) {
        return makeLiteral(
          ast,
          Object.assign({}, ...properties.map(prop => {
            let name: string;
            switch (prop.key.type) {
              case 'Identifier': name = prop.key.name; break;
              case 'Literal': name = prop.key.value; break;
              default: throw new Error('expected Identifier or Literal prop key name');
            }
            return { [name]: (prop.value as AcornJsxAst.Literal).value }
          })));
      } else {
        return Object.assign({}, ast, { properties });
      }
    }

    case 'ArrayExpression': {
      const elements =
        ast.elements.map(e => evaluateExpression(e, opts));
      if (elements.every(e => e.type === 'Literal')) {
        return makeLiteral(
          ast,
          elements.map(e => (e as AcornJsxAst.Literal).value)
        );
      } else {
        return Object.assign({}, ast, { elements });
      }
    }

    default:
      throw new Error('unexpected AST ' + (ast as any).type);
  }
}
