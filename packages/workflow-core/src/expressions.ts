export type WorkflowExpressionStepResult = {
  output: unknown;
  metadata?: Record<string, unknown>;
};

export type WorkflowExpressionContext = {
  trigger: unknown;
  steps: Record<string, WorkflowExpressionStepResult>;
};

export type WorkflowExpressionIssue = {
  path: string;
  message: string;
};

type TemplateSegment =
  | { type: "literal"; value: string }
  | { type: "expression"; source: string; path: Array<string | number> };

export class WorkflowExpressionError extends Error {
  constructor(
    message: string,
    readonly expression?: string
  ) {
    super(message);
    this.name = "WorkflowExpressionError";
  }
}

export function resolveWorkflowTemplate(
  value: unknown,
  context: WorkflowExpressionContext
): unknown {
  if (typeof value === "string") {
    return resolveTemplateString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveWorkflowTemplate(entry, context));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveWorkflowTemplate(entry, context)
      ])
    );
  }

  return value;
}

export function validateWorkflowTemplateReferences(
  value: unknown,
  availableStepKeys: ReadonlySet<string>,
  path = "value"
): WorkflowExpressionIssue[] {
  if (typeof value === "string") {
    try {
      const segments = parseTemplate(value);
      const issues: WorkflowExpressionIssue[] = [];

      for (const segment of segments) {
        if (segment.type !== "expression") {
          continue;
        }

        const [root, stepKey, namespace] = segment.path;

        if (root === "trigger") {
          continue;
        }

        if (
          root !== "steps" ||
          typeof stepKey !== "string" ||
          (namespace !== "output" && namespace !== "metadata")
        ) {
          issues.push({
            path,
            message:
              `Expression \"${segment.source}\" must start with trigger or ` +
              "steps.<step-key>.output or steps.<step-key>.metadata"
          });
          continue;
        }

        if (!availableStepKeys.has(stepKey)) {
          issues.push({
            path,
            message: `Expression references unavailable previous step \"${stepKey}\"`
          });
        }
      }

      return issues;
    } catch (error) {
      return [
        {
          path,
          message:
            error instanceof Error ? error.message : "Expression syntax is invalid"
        }
      ];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      validateWorkflowTemplateReferences(entry, availableStepKeys, `${path}[${index}]`)
    );
  }

  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      validateWorkflowTemplateReferences(entry, availableStepKeys, `${path}.${key}`)
    );
  }

  return [];
}

export function parseWorkflowExpression(source: string): Array<string | number> {
  const input = source.trim();

  if (input.length === 0) {
    throw new WorkflowExpressionError("Expression cannot be empty", source);
  }

  const path: Array<string | number> = [];
  let index = 0;

  const root = readBareSegment(input, index);
  path.push(root.value);
  index = root.nextIndex;

  while (index < input.length) {
    if (input[index] === ".") {
      const segment = readBareSegment(input, index + 1);
      path.push(segment.value);
      index = segment.nextIndex;
      continue;
    }

    if (input[index] === "[") {
      const segment = readBracketSegment(input, index);
      path.push(segment.value);
      index = segment.nextIndex;
      continue;
    }

    throw new WorkflowExpressionError(
      `Unexpected character \"${input[index]}\" in expression \"${source}\"`,
      source
    );
  }

  for (const segment of path) {
    if (
      segment === "__proto__" ||
      segment === "prototype" ||
      segment === "constructor"
    ) {
      throw new WorkflowExpressionError(
        `Expression path segment \"${segment}\" is not allowed`,
        source
      );
    }
  }

  return path;
}

function resolveTemplateString(
  value: string,
  context: WorkflowExpressionContext
): unknown {
  const segments = parseTemplate(value);

  if (segments.length === 1 && segments[0]?.type === "expression") {
    return resolveExpressionPath(segments[0], context);
  }

  return segments
    .map((segment) => {
      if (segment.type === "literal") {
        return segment.value;
      }

      const resolved = resolveExpressionPath(segment, context);

      if (
        resolved !== null &&
        (typeof resolved === "object" || typeof resolved === "function")
      ) {
        throw new WorkflowExpressionError(
          `Expression \"${segment.source}\" resolves to structured data and must be the entire value`,
          segment.source
        );
      }

      return String(resolved);
    })
    .join("");
}

function resolveExpressionPath(
  expression: Extract<TemplateSegment, { type: "expression" }>,
  context: WorkflowExpressionContext
): unknown {
  const [root, ...segments] = expression.path;
  let current: unknown;

  if (root === "trigger") {
    current = context.trigger;
  } else if (root === "steps") {
    current = context.steps;
  } else {
    throw new WorkflowExpressionError(
      `Expression \"${expression.source}\" must start with trigger or steps`,
      expression.source
    );
  }

  for (const segment of segments) {
    if (!hasPathSegment(current, segment)) {
      throw new WorkflowExpressionError(
        `Expression \"${expression.source}\" could not resolve path segment \"${String(segment)}\"`,
        expression.source
      );
    }

    current = current[segment as keyof typeof current];
  }

  return current;
}

function parseTemplate(value: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let literal = "";
  let index = 0;

  while (index < value.length) {
    if (value.startsWith("\\{{", index)) {
      literal += "{{";
      index += 3;
      continue;
    }

    if (!value.startsWith("{{", index)) {
      literal += value[index];
      index += 1;
      continue;
    }

    if (literal.length > 0) {
      segments.push({ type: "literal", value: literal });
      literal = "";
    }

    const endIndex = value.indexOf("}}", index + 2);

    if (endIndex === -1) {
      throw new WorkflowExpressionError("Expression is missing closing braces");
    }

    const source = value.slice(index + 2, endIndex).trim();
    segments.push({
      type: "expression",
      source,
      path: parseWorkflowExpression(source)
    });
    index = endIndex + 2;
  }

  if (literal.length > 0 || segments.length === 0) {
    segments.push({ type: "literal", value: literal });
  }

  return segments;
}

function readBareSegment(input: string, startIndex: number) {
  let index = startIndex;

  while (
    index < input.length &&
    input[index] !== "." &&
    input[index] !== "[" &&
    input[index] !== "]"
  ) {
    index += 1;
  }

  const value = input.slice(startIndex, index).trim();

  if (value.length === 0 || /\s/.test(value)) {
    throw new WorkflowExpressionError(`Invalid expression path near \"${input.slice(startIndex)}\"`);
  }

  return { value, nextIndex: index };
}

function readBracketSegment(input: string, startIndex: number) {
  let index = startIndex + 1;

  while (input[index] === " ") {
    index += 1;
  }

  const quote = input[index];

  if (quote === '"' || quote === "'") {
    index += 1;
    let value = "";

    while (index < input.length && input[index] !== quote) {
      if (input[index] === "\\") {
        index += 1;

        if (index >= input.length) {
          break;
        }
      }

      value += input[index];
      index += 1;
    }

    if (input[index] !== quote) {
      throw new WorkflowExpressionError("Expression has an unterminated quoted path segment");
    }

    index += 1;

    while (input[index] === " ") {
      index += 1;
    }

    if (input[index] !== "]") {
      throw new WorkflowExpressionError("Expression bracket path is missing a closing bracket");
    }

    return { value, nextIndex: index + 1 };
  }

  const endIndex = input.indexOf("]", index);

  if (endIndex === -1) {
    throw new WorkflowExpressionError("Expression bracket path is missing a closing bracket");
  }

  const rawIndex = input.slice(index, endIndex).trim();

  if (!/^\d+$/.test(rawIndex)) {
    throw new WorkflowExpressionError("Expression brackets must contain an index or quoted property");
  }

  return { value: Number(rawIndex), nextIndex: endIndex + 1 };
}

function hasPathSegment(
  value: unknown,
  segment: string | number
): value is Record<string | number, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(value, segment);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
