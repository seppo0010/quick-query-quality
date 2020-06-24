import * as chevrotain from 'chevrotain';
const createToken = chevrotain.createToken;
const tokenMatcher = chevrotain.tokenMatcher;
const Lexer = chevrotain.Lexer;
const EmbeddedActionsParser = chevrotain.EmbeddedActionsParser;

const Connector = createToken({ name: 'Connector', pattern: Lexer.NA });
const And = createToken({ name: 'And', pattern: /AND/, categories: Connector});
const Or = createToken({ name: 'Or', pattern: /OR/, categories: Connector});
const LParen = createToken({ name: 'LParen', pattern: /\(/});
LParen.LABEL = '\'(\'';
const RParen = createToken({ name: 'RParen', pattern: /\)/});
RParen.LABEL = '\')\'';
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/});
const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"/});
const PathSegment = createToken({ name: 'PathSegment', pattern: /[a-zA-Z][a-zA-Z0-9]*/});
const Period = createToken({ name: 'Period', pattern: /./});
Period.LABEL = '\'.\'';
const Comparison = createToken({ name: 'Comparison', pattern: Lexer.NA });
const GreaterThanOrEqual = createToken({ name: 'GreaterThanOrEqual', pattern: />=/, categories: Comparison});
GreaterThanOrEqual.LABEL = '\'>=\'';
const GreaterThan = createToken({ name: 'GreaterThan', pattern: />[^=]/, categories: Comparison});
GreaterThan.LABEL = '\'>\'';
const LessThanOrEqual = createToken({ name: 'LessThanOrEqual', pattern: /<=/, categories: Comparison});
LessThanOrEqual.LABEL = '\'<=\'';
const LessThan = createToken({ name: 'LessThan', pattern: /<[^=]/, categories: Comparison});
LessThan.LABEL = '\'<\'';
const Equal = createToken({ name: 'Equal', pattern: /={1,3}/, categories: Comparison});
Equal.LABEL = '\'=\'';
const NotEqual = createToken({ name: 'NotEqual', pattern: /!={1,2}/, categories: Comparison});
NotEqual.LABEL = '\'!=\'';

const True = createToken({ name: 'True', pattern: /true/});
const False = createToken({ name: 'False', pattern: /false/});
const Null = createToken({ name: 'Null', pattern: /null/});
const LCurly = createToken({ name: 'LCurly', pattern: /{/});
LCurly.LABEL = '\'{\'';
const RCurly = createToken({ name: 'RCurly', pattern: /}/});
RCurly.LABEL = '\'}\'';
const LSquare = createToken({ name: 'LSquare', pattern: /\[/});
LSquare.LABEL = '\'[\'';
const RSquare = createToken({ name: 'RSquare', pattern: /]/});
RSquare.LABEL = '\']\'';
const Comma = createToken({ name: 'Comma', pattern: /,/});
Comma.LABEL = '\',\'';
const Colon = createToken({ name: 'Colon', pattern: /:/});
Colon.LABEL = '\':\'';

const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// whitespace is normally very common so it is placed first to speed up the lexer
const allTokens = [WhiteSpace, LParen, RParen, NumberLiteral, Connector, And, Or, StringLiteral, GreaterThanOrEqual, GreaterThan,
  LessThanOrEqual, LessThan, Equal, NotEqual, RCurly, LCurly, LSquare, RSquare, Comma, Colon, True, False, Null, PathSegment, Period];
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
}

class Expression {
  getValue(qr: QueryRunner): any { throw new Error('unimplemented'); }
  toString(): string { throw new Error('unimplemented'); }
}

class LiteralExpression extends Expression {
  token: chevrotain.IToken;

  constructor(token: chevrotain.IToken) {
    super();
    this.token = token;
  }
  getValue(qr: QueryRunner): any {
    return JSON.parse(this.token.image);
  }

  toString(): string {
    return this.token.image;
  }
}

class ArrayExpression extends Expression {
  values: Expression[];

  constructor(values: Expression[]) {
    super();
    this.values = values;
  }
  getValue(qr: QueryRunner): any {
    return this.values.map((v) => v.getValue(qr));
  }
  toString(): string {
    return `[${this.values.map((v) => v.toString())}]`;
  }
}

class ObjectExpression extends Expression {
  values: Record<string, Expression>;

  constructor(values: Record<string, Expression>) {
    super();
    this.values = values;
  }
  getValue(qr: QueryRunner): any {
    return Object.fromEntries(Object.entries(this.values).map(([k, v]) => [k, v.getValue(qr)]));
  }
  toString(): string {
    return `{${Object.entries(this.values).map(([k, v]) => `${JSON.stringify(k)}: ${v.toString()},`).join('\n')}}`;
  }
}

class PathSegmentExpression extends Expression {
  token: chevrotain.IToken;
  parent?: Expression;

  constructor(token: chevrotain.IToken, parent?: Expression) {
    super();
    this.token = token;
    this.parent = parent;
  }

  getValue(qr: QueryRunner): any {
    const context = this.parent ? this.parent.getValue(qr) : qr.context;
    if (context instanceof Promise) {
      return context;
    }
    if (!context) {
      return undefined;
    }

    let subv: any = context[this.token.image];
    if (typeof(subv) === 'function') {
      const strPath = this.toString();
      if (typeof qr.cache[strPath] !== 'undefined') {
        subv = qr.cache[strPath];
      } else {
        subv = subv();
        qr.cache[strPath] = subv;
        if (subv instanceof Promise) {
          subv.then((subvResolved) => qr.cache[strPath] = subvResolved);
          qr.promises.push(subv);
        }
      }
    }
    return subv;
  }
  toString(): string {
    const parent = this.parent?.toString();
    if (parent) {
      return `${parent}.${this.token.image}`;
    }
    return this.token.image;
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
  value: (idx: number) => Expression;
  objectPath: any;
  functionCall: any;
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
      const value: Record<string, Expression> = { };
      $.CONSUME(LCurly);
      $.MANY_SEP({
        SEP: Comma, DEF: () => {
          const [key, val] = $.SUBRULE($.objectItem);
          if (typeof key !== 'undefined') {
            value[JSON.parse(key.image)] = val;
          }
        },
      });
      $.CONSUME(RCurly);
      return new ObjectExpression(value);
    });

    $.RULE('objectItem', () => {
      const key = $.CONSUME(StringLiteral);
      $.CONSUME(Colon);
      const val = $.SUBRULE($.value);
      if (key.tokenType.name === 'RECORDING_PHASE_TOKEN') {
        return ['', val];
      }
      return [key, val];
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
      return new ArrayExpression(vals);
    });

    $.RULE('value', () => {
      return $.OR([
        { ALT: () => new LiteralExpression($.CONSUME(StringLiteral))},
        { ALT: () => new LiteralExpression($.CONSUME(NumberLiteral))},
        { ALT: () => $.SUBRULE($.object)},
        { ALT: () => $.SUBRULE($.array)},
        { ALT: () => new LiteralExpression($.CONSUME(True))},
        { ALT: () => new LiteralExpression($.CONSUME(False))},
        { ALT: () => new LiteralExpression($.CONSUME(Null))},
        { ALT: () => $.SUBRULE($.objectPath)},
      ]);
    });

    $.RULE('objectPath', () => {
      let val = new PathSegmentExpression($.CONSUME(PathSegment));

      $.OPTION(() => {
        $.CONSUME(Period);
        $.MANY_SEP({
          SEP: Period, DEF: () => {
            val = $.OR([
              { ALT: () => new PathSegmentExpression($.CONSUME1(PathSegment), val)},
              { ALT: () => $.SUBRULE($.functionCall)},
            ]);
          },
        });
      });
      return val;
    });

    $.RULE('functionCall', () => {
      $.CONSUME(LParen);
      const vals: any[] = [];
      $.MANY_SEP({
        SEP: Comma, DEF: () => {
          vals.push($.SUBRULE($.value));
        },
      });
      $.CONSUME(RParen);
      return vals;
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
      const token = $.SUBRULE($.value);
      const value = evaluate && token.getValue(runner);
      const op = $.CONSUME(Comparison);
      const rhsToken = $.SUBRULE2($.value);
      const rhsVal = evaluate && rhsToken.getValue(runner);

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
