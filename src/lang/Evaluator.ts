import * as AcornJsxAst from '../lang/acornJsxAst';

function makeLiteral(ast: AcornJsxAst.Expression, value: any) {
  return Object.assign({}, ast, { type: 'Literal', value });
}

// TOOD(jaked)
// it seems like we should be able to drop `mode` and use the presence /
// absence of fields to refine the type (e.g. `if (names)`), but TS
// complains that the field doesn't exist on both arms.
type Opts =
  {
    mode: 'compile',
    names: Set<string>,
    renderJsxElement: (e: AcornJsxAst.JSXElement) => any
  } |
  {
    mode: 'run',
    env: Map<string, any>
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
      switch (opts.mode) {
        case 'compile':
          opts.names.add(ast.name);
          return ast;
        case 'run':
          return makeLiteral(ast, opts.env.get(ast.name));
        default:
          throw 'bug'; // match should be exhaustive but TS says it falls through?
      }

    case 'JSXElement':
      switch (opts.mode) {
        case 'compile':
          // we don't need to recurse into JSXElements;
          // focal handles reaction inside nested elements
          return makeLiteral(ast, opts.renderJsxElement(ast));
        default:
          throw 'unexpected JSXElement at runtime';
      }

    case 'BinaryExpression':
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

    case 'ObjectExpression':
      const properties = ast.properties.map(prop => {
        const value = evaluateExpression(prop.value, opts);
        return Object.assign({}, prop, { value })
      });
      if (properties.every((prop) => prop.value.type === 'Literal')) {
        return makeLiteral(
          ast,
          Object.assign({}, ...properties.map(prop =>
            ({ [prop.key.name]: (prop.value as AcornJsxAst.Literal).value })
          )));
      } else {
        return Object.assign({}, ast, { properties });
      }

    default:
      throw 'unexpected AST ' + (ast as any).type;
  }
}
