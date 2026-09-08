import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

const maximumSchemaCharacters = 64 * 1024;

export type StructuredOutputSchemaValidation =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validateStructuredOutputSchema(
  schema: unknown
): StructuredOutputSchemaValidation {
  if (!isPlainObject(schema)) {
    return { valid: false, errors: ["Output schema must be a JSON object"] };
  }

  if (schema.type !== "object") {
    return { valid: false, errors: ["Output schema root type must be object"] };
  }

  if (JSON.stringify(schema).length > maximumSchemaCharacters) {
    return { valid: false, errors: ["Output schema must not exceed 64K characters"] };
  }

  try {
    const ajv = createAjv();
    ajv.compile(schema);

    const providerErrors = validateStrictObjectRules(schema);

    if (providerErrors.length > 0) {
      return { valid: false, errors: providerErrors };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Output schema is invalid"]
    };
  }
}

function validateStrictObjectRules(
  schema: Record<string, unknown>,
  path = "$"
): string[] {
  const errors: string[] = [];

  if (schema.type === "object") {
    if (schema.additionalProperties !== false) {
      errors.push(`${path} must set additionalProperties to false`);
    }

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const key of Object.keys(properties)) {
      if (!required.includes(key)) {
        errors.push(`${path}.${key} must be listed in required; use a null union for optional values`);
      }

      const propertySchema = properties[key];

      if (isPlainObject(propertySchema)) {
        errors.push(...validateStrictObjectRules(propertySchema, `${path}.${key}`));
      }
    }
  }

  if (schema.type === "array" && isPlainObject(schema.items)) {
    errors.push(...validateStrictObjectRules(schema.items, `${path}[]`));
  }

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((entry, index) => {
      if (isPlainObject(entry)) {
        errors.push(...validateStrictObjectRules(entry, `${path}.anyOf[${index}]`));
      }
    });
  }

  return errors;
}

export function validateStructuredOutput(
  schema: Record<string, unknown>,
  output: unknown
): StructuredOutputSchemaValidation {
  try {
    const validate = createAjv().compile(schema);

    if (validate(output)) {
      return { valid: true };
    }

    return {
      valid: false,
      errors: formatAjvErrors(validate.errors)
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Output schema is invalid"]
    };
  }
}

function createAjv() {
  return new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false
  });
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return ["Structured output does not match its schema"];
  }

  return errors.map((error) => {
    const path = error.instancePath || "$";
    return `${path} ${error.message ?? "is invalid"}`;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
