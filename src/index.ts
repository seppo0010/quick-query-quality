import * as chevrotain from 'chevrotain';
const createToken = chevrotain.createToken;
const tokenMatcher = chevrotain.tokenMatcher;
const Lexer = chevrotain.Lexer;
const EmbeddedActionsParser = chevrotain.EmbeddedActionsParser;

const Connector = createToken({ name: 'Connector', pattern: Lexer.NA });
const And = createToken({ name: 'And', pattern: /AND/, categories: Connector});
const Or = createToken({ name: 'Or', pattern: /OR/, categories: Connector});
const LParen = createToken({ name: 'LParen', pattern: /\(/});
const RParen = createToken({ name: 'RParen', pattern: /\)/});
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/});
const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"/});
const ObjectPath = createToken({ name: 'ObjectPath', pattern: /[a-zA-Z][a-zA-Z0-9\.]*/});
const Comparison = createToken({ name: 'Comparison', pattern: Lexer.NA });
const GreaterThanOrEqual = createToken({ name: 'GreaterThanOrEqual', pattern: />=/, categories: Comparison});
const GreaterThan = createToken({ name: 'GreaterThan', pattern: />[^=]/, categories: Comparison});
const LessThanOrEqual = createToken({ name: 'LessThanOrEqual', pattern: /<=/, categories: Comparison});
const LessThan = createToken({ name: 'LessThan', pattern: /<[^=]/, categories: Comparison});
const Equal = createToken({ name: 'Equal', pattern: /={1,3}/, categories: Comparison});
const NotEqual = createToken({ name: 'NotEqual', pattern: /!={1,2}/, categories: Comparison});

const True = createToken({ name: 'True', pattern: /true/});
const False = createToken({ name: 'False', pattern: /false/});
const Null = createToken({ name: 'Null', pattern: /null/});
const LCurly = createToken({ name: 'LCurly', pattern: /{/});
const RCurly = createToken({ name: 'RCurly', pattern: /}/});
const LSquare = createToken({ name: 'LSquare', pattern: /\[/});
const RSquare = createToken({ name: 'RSquare', pattern: /]/});
const Comma = createToken({ name: 'Comma', pattern: /,/});
const Colon = createToken({ name: 'Colon', pattern: /:/});

LParen.LABEL = '\'(\'';
RParen.LABEL = '\')\'';
LCurly.LABEL = '\'{\'';
RCurly.LABEL = '\'}\'';
LSquare.LABEL = '\'[\'';
RSquare.LABEL = '\']\'';
Comma.LABEL = '\',\'';
Colon.LABEL = '\':\'';

const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// whitespace is normally very common so it is placed first to speed up the lexer
const allTokens = [WhiteSpace, LParen, RParen, NumberLiteral, Connector, And, Or, StringLiteral, GreaterThanOrEqual, GreaterThan,
  LessThanOrEqual, LessThan, Equal, NotEqual, RCurly, LCurly, LSquare, RSquare, Comma, Colon, True, False, Null, ObjectPath];
const QLexer = new Lexer(allTokens);

function eq(lhs: any, rhs: any): boolean {
  if (Array.isArray(lhs) && Array.isArray(rhs)) {
    return lhs.length === rhs.length && lhs.every((val, i) => eq(val, rhs[i]));
  }
  if (typeof lhs === 'object' && typeof rhs === 'object' && lhs !== null && rhs !== null) {
    return Object.keys(lhs).length === Object.keys(rhs).length && Object.keys(lhs).every((k) => eq(lhs[k], rhs[k]));
  }
  return lhs === rhs;
}

class QueryRunner {
  context: any;
  cache: any;
  promises: Promise<any>[] = [];

  constructor(context: any) {
    this.context = context;
    this.cache = { };
    this.promises = [];
  }

  getValue(val: any): any {
    if ([
      NumberLiteral,
      StringLiteral,
      True,
      False,
      Null,
    ].some((x) => tokenMatcher(val, x))) {
      return JSON.parse(val.image);
    }
    if (Array.isArray(val)) {
      return val.map((v) => this.getValue(v));
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
    return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, this.getValue(v)]));
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
    const val = this.parser.expression(true, [runner, true]);
    if (runner.promises.length) {
      throw new Error('Promise return in querySync is not supported.');
    }
    const errors = this.parser.errors.concat([]);
    this.parser.reset();
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
    return val;
  }

  async run(context?: any): Promise<boolean> {
    let promisesLength;
    let val;
    const runner = new QueryRunner(context);
    do {
      await Promise.all(runner.promises);
      promisesLength = runner.promises.length;
      val = this.parser.expression(true, [runner, true]);
      const errors = this.parser.errors.concat([]);
      this.parser.reset();
      if (errors.length) {
        throw new Error(errors.join('\n'));
      }
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
  object: any;
  array: any;
  objectItem: any;
  value: any;
}

class QueryParser extends EmbeddedActionsParser {
  constructor(queryString: string) {
    super(allTokens);

    const $ = this;

    $.RULE('json', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.object)},
        { ALT: () => $.SUBRULE($.array)},
      ]);
    });

    $.RULE('object', () => {
      $.CONSUME(LCurly);
      const obj: Record<string, any> = { };
      $.MANY_SEP({
        SEP: Comma, DEF: () => {
          const [key, val] = $.SUBRULE($.objectItem);
          if (typeof key !== 'undefined') {
            obj[key] = val;
          }
        },
      });
      $.CONSUME(RCurly);
      return obj;
    });

    $.RULE('objectItem', () => {
      const key = $.CONSUME(StringLiteral);
      $.CONSUME(Colon);
      const val = $.SUBRULE($.value);
      if (key.tokenType.name === 'RECORDING_PHASE_TOKEN') {
        return ['', val];
      }
      return [JSON.parse(key.image), val];
    });

    $.RULE('array', () => {
      $.CONSUME(LSquare);
      const vals: any[] = [];
      $.MANY_SEP({
        SEP: Comma, DEF: () => {
          vals.push($.SUBRULE($.value));
        },
      });
      $.CONSUME(RSquare);
      return vals;
    });

    $.RULE('value', () => {
      return $.OR([
        { ALT: () => $.CONSUME(StringLiteral)},
        { ALT: () => $.CONSUME(NumberLiteral)},
        { ALT: () => $.SUBRULE($.object)},
        { ALT: () => $.SUBRULE($.array)},
        { ALT: () => $.CONSUME(True)},
        { ALT: () => $.CONSUME(False)},
        { ALT: () => $.CONSUME(Null)},
        { ALT: () => $.CONSUME(ObjectPath)},
      ]);
    });

    $.RULE('expression', (runner: QueryRunner, evaluate: boolean) => {
      return $.SUBRULE($.connectorExpression, { ARGS: [runner, evaluate]});
    });

    $.RULE('connectorExpression', (runner: QueryRunner, evaluate: boolean) => {
      let value = $.SUBRULE($.atomicExpression, { ARGS: [runner, evaluate]});
      $.MANY(() => {
        const conn = $.CONSUME(Connector);

        if (tokenMatcher(conn, And)) {
          if (value) {
            value = $.SUBRULE2($.atomicExpression, { ARGS: [runner, evaluate]});
          } else {
            $.SUBRULE2($.atomicExpression, { ARGS: [runner, false]});
          }
        } else {
          if (!value) {
            value = $.SUBRULE2($.atomicExpression, { ARGS: [runner, evaluate]});
          } else {
            $.SUBRULE2($.atomicExpression, { ARGS: [runner, false]});
          }
        }
      });

      return value;
    });

    $.RULE('atomicExpression', (runner: QueryRunner, evaluate: boolean) => $.OR([
      { ALT: () => $.SUBRULE($.parenthesisExpression, { ARGS: [runner, evaluate]})},
      { ALT: () => $.SUBRULE($.comparisonExpression, { ARGS: [runner, evaluate]})},
    ]));

    $.RULE('comparisonExpression', (runner: QueryRunner, evaluate: boolean) => {
      const token = $.SUBRULE($.value) as any;
      if (token.description === 'This Object indicates the Parser is during Recording Phase') {
        return;
      }
      const value = evaluate && runner.getValue(token);
      const op = $.CONSUME(Comparison);
      const rhsToken = $.SUBRULE2($.value) as chevrotain.IToken;
      const rhsVal = evaluate && runner.getValue(rhsToken);

      if (tokenMatcher(op, GreaterThan)) {
        return value > rhsVal;
      } else if (tokenMatcher(op, GreaterThanOrEqual)) {
        return value >= rhsVal;
      } else if (tokenMatcher(op, LessThan)) {
        return value < rhsVal;
      } else if (tokenMatcher(op, LessThanOrEqual)) {
        return value <= rhsVal;
      } else if (tokenMatcher(op, Equal)) {
        return eq(value, rhsVal);
      } else if (tokenMatcher(op, NotEqual)) {
        return value !== rhsVal;
      }
      return false;
    });

    $.RULE('parenthesisExpression', (runner: QueryRunner, evaluate: boolean) => {
      $.CONSUME(LParen);
      const val = $.SUBRULE($.expression, { ARGS: [runner, evaluate]});
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
