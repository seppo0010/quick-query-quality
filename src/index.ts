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
const Value = createToken({ name: 'Value', pattern: Lexer.NA });
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /(?:0|[1-9]\d*)/, categories: Value});
const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"/, categories: Value});
const Comparison = createToken({ name: 'Comparison', pattern: Lexer.NA });
const GreaterThanOrEqual = createToken({ name: 'GreaterThanOrEqual', pattern: />=/, categories: Comparison});
const GreaterThan = createToken({ name: 'GreaterThan', pattern: />[^=]/, categories: Comparison});
const LessThanOrEqual = createToken({ name: 'LessThanOrEqual', pattern: /<=/, categories: Comparison});
const LessThan = createToken({ name: 'LessThan', pattern: /<[^=]/, categories: Comparison});
const Equal = createToken({ name: 'Equal', pattern: /={1,3}/, categories: Comparison});

const WhiteSpace = createToken({
name: 'WhiteSpace',
pattern: /\s+/,
group: Lexer.SKIPPED,
});

// whitespace is normally very common so it is placed first to speed up the lexer
const allTokens = [WhiteSpace, LParen, RParen, NumberLiteral, Connector, And, Or, StringLiteral, GreaterThanOrEqual , GreaterThan , LessThanOrEqual , LessThan , Equal ];
const QLexer = new Lexer(allTokens);

declare interface Query {
  expression: any;
  atomicExpression: any;
  connectorExpression: any;
  comparisonExpression: any;
  parenthesisExpression: any;
}
class Query extends EmbeddedActionsParser {
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
      value = JSON.parse(token.image);
      op = $.CONSUME(Comparison);
      rhsVal = JSON.parse($.CONSUME2(Value).image);

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
}

const parser = new Query();

export default function (query: string): boolean {
  const lexingResult = QLexer.tokenize(query);
  parser.input = lexingResult.tokens;
  const val = parser.expression();

  if (parser.errors.length > 0) {
    throw new Error(parser.errors.join('\n'));
  }
  return val;
}
