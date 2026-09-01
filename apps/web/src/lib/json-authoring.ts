export function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export function parseJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
