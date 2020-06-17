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

class QueryRunner {
  context: any;
  cache: any;
  promises: Promise<any>[] = [];

  constructor(context: any) {
    this.context = context;
    this.cache = { };
    this.promises = [];
  }

  getValue(val: chevrotain.IToken): any {
    if (tokenMatcher(val, NumberLiteral) || tokenMatcher(val, StringLiteral)) {
      return JSON.parse(val.image);
    }
    if (tokenMatcher(val, ObjectPath)) {
      return val.image.split('.').reduce((v: { value: any, path: string[]}, key: string) => {
        const path = v.path.concat([key]);
        if (v.value instanceof Promise) {
          return v;
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

export class Query {
  queryString: string;
  parser: QueryParser;

  constructor(queryString: string) {
    this.queryString = queryString;
    this.parser = new QueryParser(queryString);
  }

  runSync(context?: any): boolean {
    const runner = new QueryRunner(context);
    const val = this.parser.expression(true, [runner]);
    if (runner.promises.length) {
      throw new Error('Promise return in querySync is not supported.');
    }
    this.parser.reset();
    return val;
  }

  async run(context?: any): Promise<boolean> {
    let promisesLength;
    let val;
    const runner = new QueryRunner(context);
    do {
      await Promise.all(runner.promises);
      promisesLength = runner.promises.length;
      val = this.parser.expression(true, [runner]);
      this.parser.reset();
    } while (promisesLength !== runner.promises.length);
    return val;
  }
}

declare interface QueryParser {
  expression: any;
  atomicExpression: any;
  connectorExpression: any;
  comparisonExpression: any;
  parenthesisExpression: any;
}

class QueryParser extends EmbeddedActionsParser {
  constructor(queryString: string) {
    super(allTokens);

    const $ = this;

    $.RULE('expression', (runner: QueryRunner) => {
      return $.SUBRULE($.connectorExpression, { ARGS: [runner]});
    });

    $.RULE('connectorExpression', (runner: QueryRunner) => {
      let value: boolean;
      let conn;
      let rhsVal: boolean;

      value = $.SUBRULE($.atomicExpression, { ARGS: [runner]});
      $.MANY(() => {
        conn = $.CONSUME(Connector);
        rhsVal = $.SUBRULE2($.atomicExpression, { ARGS: [runner]});

        if (tokenMatcher(conn, And)) {
          value = value && rhsVal;
        } else {
          value = value || rhsVal;
        }
      });

      return value;
    });

    $.RULE('atomicExpression', (runner: QueryRunner) => $.OR([
      { ALT: () => $.SUBRULE($.parenthesisExpression, { ARGS: [runner]})},
      { ALT: () => $.SUBRULE($.comparisonExpression, { ARGS: [runner]})},
    ]));

    $.RULE('comparisonExpression', (runner: QueryRunner) => {
      let value;
      let op;
      let rhsVal;

      const token = $.CONSUME(Value);
      if (token.tokenType.name === 'RECORDING_PHASE_TOKEN') {
        return;
      }
      value = runner.getValue(token);
      op = $.CONSUME(Comparison);
      rhsVal = runner.getValue($.CONSUME2(Value));

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

    $.RULE('parenthesisExpression', (runner: QueryRunner) => {
      $.CONSUME(LParen);
      const val = $.SUBRULE($.expression, { ARGS: [runner]});
      $.CONSUME(RParen);
      return val;
    });

    this.performSelfAnalysis();
    this.input = QLexer.tokenize(queryString).tokens;
  }
}

export function querySync(queryString: string, context?: any): boolean {
  return new Query(queryString).runSync(context);
}

export default function query(queryString: string, context?: any): Promise<boolean> {
  return new Query(queryString).run(context);
}
