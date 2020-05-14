import * as chevrotain from 'chevrotain';
import { promises } from 'fs';
const createToken = chevrotain.createToken;
const tokenMatcher = chevrotain.tokenMatcher;
const Lexer = chevrotain.Lexer;
const EmbeddedActionsParser = chevrotain.EmbeddedActionsParser;

const Connector = createToken({ name: 'Connector', pattern: Lexer.NA });
const And = createToken({ name: 'And', pattern: /AND/, categories: Connector});
const Or = createToken({ name: 'Or', pattern: /OR/, categories: Connector});
const LParen = createToken({ name: 'LParen', pattern: /\(/});
const RParen = createToken({ name: 'RParen', pattern: /\)/});
const Value = createToken({ name: 'Value', pattern: Lexer.NA });
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /(?:0|[1-9]\d*)/, categories: Value});
const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"/, categories: Value});
const ObjectPath = createToken({ name: 'ObjectPath', pattern: /[a-zA-Z][a-zA-Z0-9\.]*/, categories: Value});
const Comparison = createToken({ name: 'Comparison', pattern: Lexer.NA });
const GreaterThanOrEqual = createToken({ name: 'GreaterThanOrEqual', pattern: />=/, categories: Comparison});
const GreaterThan = createToken({ name: 'GreaterThan', pattern: />[^=]/, categories: Comparison});
const LessThanOrEqual = createToken({ name: 'LessThanOrEqual', pattern: /<=/, categories: Comparison});
const LessThan = createToken({ name: 'LessThan', pattern: /<[^=]/, categories: Comparison});
const Equal = createToken({ name: 'Equal', pattern: /={1,3}/, categories: Comparison});
const NotEqual = createToken({ name: 'NotEqual', pattern: /!={1,2}/, categories: Comparison});

const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// whitespace is normally very common so it is placed first to speed up the lexer
const allTokens = [WhiteSpace, LParen, RParen, NumberLiteral, Connector, And, Or, StringLiteral, GreaterThanOrEqual, GreaterThan, LessThanOrEqual, LessThan, Equal, NotEqual, ObjectPath];
const QLexer = new Lexer(allTokens);

declare interface Query {
  expression: any;
  atomicExpression: any;
  connectorExpression: any;
  comparisonExpression: any;
  parenthesisExpression: any;
}

class Query extends EmbeddedActionsParser {
  context: any;
  cache: any;
  promises: Promise<any>[] = [];

  constructor() {
    super(allTokens);

    const $ = this;

    $.RULE('expression', () => {
      return $.SUBRULE($.connectorExpression);
    });

    $.RULE('connectorExpression', () => {
      let value: boolean;
      let conn;
      let rhsVal: boolean;

      value = $.SUBRULE($.atomicExpression);
      $.MANY(() => {
        conn = $.CONSUME(Connector);
        rhsVal = $.SUBRULE2($.atomicExpression);

        if (tokenMatcher(conn, And)) {
          value = value && rhsVal;
        } else {
          value = value || rhsVal;
        }
      });

      return value;
    });

    $.RULE('atomicExpression', () => $.OR([
      { ALT: () => $.SUBRULE($.parenthesisExpression)},
      { ALT: () => $.SUBRULE($.comparisonExpression)},
    ]));

    $.RULE('comparisonExpression', () => {
      let value;
      let op;
      let rhsVal;

      const token = $.CONSUME(Value);
      if (token.tokenType.name === 'RECORDING_PHASE_TOKEN') {
        return;
      }
      value = this.getValue(token);
      op = $.CONSUME(Comparison);
      rhsVal = this.getValue($.CONSUME2(Value));

      if (tokenMatcher(op, GreaterThan)) {
          return value > rhsVal;
      } else if (tokenMatcher(op, GreaterThanOrEqual)) {
        return value >= rhsVal;
      } else if (tokenMatcher(op, LessThan)) {
        return value < rhsVal;
      } else if (tokenMatcher(op, LessThanOrEqual)) {
        return value <= rhsVal;
      } else if (tokenMatcher(op, Equal)) {
        return value === rhsVal;
      } else if (tokenMatcher(op, NotEqual)) {
        return value !== rhsVal;
      }
      return false;
    });

    $.RULE('parenthesisExpression', () => {
      $.CONSUME(LParen);
      const val = $.SUBRULE($.expression);
      $.CONSUME(RParen);
      return val;
    });

    this.performSelfAnalysis();
  }

  getValue(val: chevrotain.IToken): any {
    if (tokenMatcher(val, NumberLiteral) || tokenMatcher(val, StringLiteral)) {
      return JSON.parse(val.image);
    }
    if (tokenMatcher(val, ObjectPath)) {
      return val.image.split('.').reduce((v: { value: any, path: string[]}, key: string) => {
        const path = v.path.concat([key]);
        if (v.value instanceof Promise) {
          return v
        }
        let subv = v.value[key] || { };
        if (typeof(subv) === 'function') {
          const strPath = path.join('.');
          if (typeof this.cache[strPath] !== 'undefined') {
            subv = this.cache[strPath];
          } else {
            subv = subv();
            this.cache[strPath] = subv;
            if (subv instanceof Promise) {
              subv.then((subvResolved) => this.cache[strPath] = subvResolved);
              this.promises.push(subv);
            }
          }
        }
        return { value: subv, path };
      }, { value: this.context, path: []}).value || null;
    }
    throw new Error('unimplemented value type');
  }
}

export function querySync(query: string, context?: any): boolean {
  const parser = new Query();
  parser.context = context;
  parser.cache = { };
  parser.promises = [];
  const lexingResult = QLexer.tokenize(query);
  parser.input = lexingResult.tokens;
  let val = parser.expression();
  if (parser.promises.length) {
    throw new Error('Promise return in querySync is not supported.')
  }
  if (parser.errors.length > 0) {
    throw new Error(parser.errors.join('\n'));
  }
  return val;
};

export default async (query: string, context?: any): Promise<boolean> => {
  let promisesLength;
  let val;
  const parser = new Query();
  parser.context = context;
  parser.cache = { };
  parser.promises = [];
  do {
    await Promise.all(parser.promises);
    const lexingResult = QLexer.tokenize(query);
    parser.input = lexingResult.tokens;
    promisesLength = parser.promises.length;
    val = parser.expression();
    if (parser.errors.length > 0) {
      throw new Error(parser.errors.join('\n'));
    }
  } while (promisesLength !== parser.promises.length);
  return val;
};
