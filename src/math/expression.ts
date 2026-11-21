export type MathAst =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "unary"; operator: "+" | "-"; operand: MathAst }
  | {
      type: "binary";
      operator: "+" | "-" | "*" | "/" | "^";
      left: MathAst;
      right: MathAst;
    }
  | { type: "call"; name: string; argument: MathAst };

export interface CompiledExpression {
  source: string;
  ast: MathAst;
  variables: string[];
  evaluate: (x: number, parameters: Record<string, number>) => number;
}

type Token =
  | { type: "number"; value: number; position: number }
  | { type: "identifier"; value: string; position: number }
  | { type: "operator"; value: string; position: number }
  | { type: "leftParen"; position: number }
  | { type: "rightParen"; position: number }
  | { type: "end"; position: number };

const FUNCTIONS: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  sgn: Math.sign
};

export class ExpressionError extends Error {
  readonly position: number;

  constructor(message: string, position = 0) {
    super(message);
    this.name = "ExpressionError";
    this.position = position;
  }
}

function normalizeSource(source: string): string {
  const fullWidth = "０１２３４５６７８９＋－＊／（）";
  const ascii = "0123456789+-*/()";
  let normalized = "";

  for (const char of source) {
    const index = fullWidth.indexOf(char);
    normalized += index >= 0 ? ascii[index] : char;
  }

  return normalized
    .replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=/i, "")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/，/g, ",")
    .trim();
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      let hasDot = false;
      while (index < source.length && /[0-9.]/.test(source[index])) {
        if (source[index] === ".") {
          if (hasDot) break;
          hasDot = true;
        }
        index += 1;
      }

      if (
        index < source.length &&
        /[eE]/.test(source[index]) &&
        /[0-9]/.test(source[index + 1] ?? "")
      ) {
        index += 1;
        if (source[index] === "+" || source[index] === "-") index += 1;
        while (index < source.length && /[0-9]/.test(source[index])) index += 1;
      }

      const raw = source.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new ExpressionError(`数字“${raw}”无法识别`, start);
      }
      tokens.push({ type: "number", value, position: start });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
        index += 1;
      }
      tokens.push({
        type: "identifier",
        value: source.slice(start, index).toLowerCase(),
        position: start
      });
      continue;
    }

    if ("+-*/^".includes(char)) {
      tokens.push({ type: "operator", value: char, position: index });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen", position: index });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen", position: index });
      index += 1;
      continue;
    }

    throw new ExpressionError(`不支持字符“${char}”`, index);
  }

  tokens.push({ type: "end", position: source.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): MathAst {
    if (this.peek().type === "end") {
      throw new ExpressionError("请输入函数表达式", 0);
    }

    const expression = this.parseAdditive();
    const token = this.peek();
    if (token.type !== "end") {
      throw new ExpressionError(`表达式在“${this.tokenText(token)}”附近无法继续解析`, token.position);
    }
    return expression;
  }

  private parseAdditive(): MathAst {
    let left = this.parseMultiplicative();

    while (true) {
      const token = this.peek();
      if (token.type !== "operator" || (token.value !== "+" && token.value !== "-")) {
        return left;
      }
      this.index += 1;
      left = {
        type: "binary",
        operator: token.value,
        left,
        right: this.parseMultiplicative()
      };
    }
  }

  private parseMultiplicative(): MathAst {
    let left = this.parseUnary();

    while (true) {
      const token = this.peek();
      if (token.type === "operator" && (token.value === "*" || token.value === "/")) {
        this.index += 1;
        left = {
          type: "binary",
          operator: token.value,
          left,
          right: this.parseUnary()
        };
        continue;
      }

      if (this.startsImplicitFactor(token)) {
        left = {
          type: "binary",
          operator: "*",
          left,
          right: this.parseUnary()
        };
        continue;
      }

      return left;
    }
  }

  private parseUnary(): MathAst {
    const token = this.peek();
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.index += 1;
      return {
        type: "unary",
        operator: token.value,
        operand: this.parseUnary()
      };
    }
    return this.parsePower();
  }

  private parsePower(): MathAst {
    const left = this.parsePrimary();
    const token = this.peek();
    if (token.type === "operator" && token.value === "^") {
      this.index += 1;
      return {
        type: "binary",
        operator: "^",
        left,
        right: this.parseUnary()
      };
    }
    return left;
  }

  private parsePrimary(): MathAst {
    const token = this.peek();

    if (token.type === "number") {
      this.index += 1;
      return { type: "number", value: token.value };
    }

    if (token.type === "leftParen") {
      this.index += 1;
      const expression = this.parseAdditive();
      this.expect("rightParen", "缺少右括号");
      return expression;
    }

    if (token.type === "identifier") {
      this.index += 1;
      const name = token.value;

      if (name === "pi") return { type: "number", value: Math.PI };
      if (name === "e") return { type: "number", value: Math.E };

      if (Object.hasOwn(FUNCTIONS, name)) {
        if (this.peek().type !== "leftParen") {
          throw new ExpressionError(`函数 ${name} 后需要括号，例如 ${name}(x)`, token.position);
        }
        this.index += 1;
        if (this.peek().type === "rightParen" || this.peek().type === "end") {
          throw new ExpressionError(`函数 ${name} 的括号内需要表达式`, this.peek().position);
        }
        const argument = this.parseAdditive();
        this.expect("rightParen", `函数 ${name} 缺少右括号`);
        return { type: "call", name, argument };
      }

      if (/^[a-z]$/.test(name)) {
        return { type: "variable", name };
      }

      throw new ExpressionError(`未知变量或函数“${name}”`, token.position);
    }

    throw new ExpressionError(`“${this.tokenText(token)}”不能作为表达式开头`, token.position);
  }

  private startsImplicitFactor(token: Token): boolean {
    return (
      token.type === "number" ||
      token.type === "identifier" ||
      token.type === "leftParen"
    );
  }

  private expect(type: "rightParen", message: string): void {
    const token = this.peek();
    if (token.type !== type) {
      throw new ExpressionError(message, token.position);
    }
    this.index += 1;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  private tokenText(token: Token): string {
    switch (token.type) {
      case "number":
        return String(token.value);
      case "identifier":
      case "operator":
        return token.value;
      case "leftParen":
        return "(";
      case "rightParen":
        return ")";
      case "end":
        return "末尾";
    }
  }
}

function collectVariables(ast: MathAst, variables: Set<string>): void {
  if (ast.type === "variable") {
    if (ast.name !== "x") variables.add(ast.name);
    return;
  }
  if (ast.type === "unary") {
    collectVariables(ast.operand, variables);
    return;
  }
  if (ast.type === "binary") {
    collectVariables(ast.left, variables);
    collectVariables(ast.right, variables);
    return;
  }
  if (ast.type === "call") {
    collectVariables(ast.argument, variables);
  }
}

function buildEvaluator(ast: MathAst): (x: number, parameters: Record<string, number>) => number {
  switch (ast.type) {
    case "number": {
      const value = ast.value;
      return () => value;
    }
    case "variable": {
      const name = ast.name;
      if (name === "x") return (x) => x;
      return (_x, parameters) => parameters[name] ?? 1;
    }
    case "unary": {
      const operand = buildEvaluator(ast.operand);
      return ast.operator === "-"
        ? (x, parameters) => -operand(x, parameters)
        : (x, parameters) => +operand(x, parameters);
    }
    case "binary": {
      const left = buildEvaluator(ast.left);
      const right = buildEvaluator(ast.right);
      switch (ast.operator) {
        case "+":
          return (x, parameters) => left(x, parameters) + right(x, parameters);
        case "-":
          return (x, parameters) => left(x, parameters) - right(x, parameters);
        case "*":
          return (x, parameters) => left(x, parameters) * right(x, parameters);
        case "/":
          return (x, parameters) => left(x, parameters) / right(x, parameters);
        case "^":
          return (x, parameters) => left(x, parameters) ** right(x, parameters);
      }
    }
    case "call": {
      const argument = buildEvaluator(ast.argument);
      const operation = FUNCTIONS[ast.name];
      return (x, parameters) => operation(argument(x, parameters));
    }
  }
}

export function compileExpression(source: string): CompiledExpression {
  const normalized = normalizeSource(source);
  const ast = new Parser(tokenize(normalized)).parse();
  const variables = new Set<string>();
  collectVariables(ast, variables);
  const evaluate = buildEvaluator(ast);

  return {
    source: normalized,
    ast,
    variables: [...variables].sort(),
    evaluate
  };
}

export function describeExpressionError(error: unknown): string {
  if (error instanceof ExpressionError) {
    return error.position > 0 ? `${error.message}（第 ${error.position + 1} 个字符）` : error.message;
  }
  if (error instanceof Error) return error.message;
  return "函数表达式无法解析";
}
