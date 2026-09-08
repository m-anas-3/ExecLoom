import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WorkflowExpressionError,
  parseWorkflowExpression,
  resolveWorkflowTemplate,
  validateStructuredOutput,
  validateStructuredOutputSchema,
  validateWorkflowDefinitionSemantics,
  validateWorkflowTemplateReferences
} from "../dist/index.js";

const context = {
  trigger: {
    customerId: "cus_123",
    active: true,
    tags: ["priority", "renewal"]
  },
  steps: {
    "fetch-customer": {
      output: {
        email: "customer@example.com",
        score: 91,
        profile: { region: "pk" }
      },
      metadata: { status: 200 }
    },
    "special.key": {
      output: { value: "bracket-value" }
    }
  }
};

describe("workflow expressions", () => {
  it("resolves trigger and previous-step paths", () => {
    assert.equal(resolveWorkflowTemplate("{{ trigger.customerId }}", context), "cus_123");
    assert.equal(
      resolveWorkflowTemplate("{{ steps.fetch-customer.output.email }}", context),
      "customer@example.com"
    );
    assert.equal(
      resolveWorkflowTemplate('{{ steps["special.key"].output.value }}', context),
      "bracket-value"
    );
    assert.equal(resolveWorkflowTemplate("{{ trigger.tags[1] }}", context), "renewal");
  });

  it("preserves native values for whole-value expressions", () => {
    assert.deepEqual(
      resolveWorkflowTemplate("{{ steps.fetch-customer.output.profile }}", context),
      { region: "pk" }
    );
    assert.equal(
      resolveWorkflowTemplate("{{ steps.fetch-customer.output.score }}", context),
      91
    );
    assert.equal(resolveWorkflowTemplate("{{ trigger.active }}", context), true);
  });

  it("resolves nested structured values without changing object keys", () => {
    assert.deepEqual(
      resolveWorkflowTemplate(
        {
          customerId: "{{ trigger.customerId }}",
          profile: "{{ steps.fetch-customer.output.profile }}",
          message: "Score: {{ steps.fetch-customer.output.score }}"
        },
        context
      ),
      {
        customerId: "cus_123",
        profile: { region: "pk" },
        message: "Score: 91"
      }
    );
  });

  it("supports escaped opening braces", () => {
    assert.equal(
      resolveWorkflowTemplate("Use \\{{ trigger.customerId }} literally", context),
      "Use {{ trigger.customerId }} literally"
    );
  });

  it("rejects missing paths and structured interpolation", () => {
    assert.throws(
      () => resolveWorkflowTemplate("{{ trigger.missing }}", context),
      WorkflowExpressionError
    );
    assert.throws(
      () =>
        resolveWorkflowTemplate(
          "Profile: {{ steps.fetch-customer.output.profile }}",
          context
        ),
      /must be the entire value/
    );
  });

  it("rejects unsafe and malformed expression paths", () => {
    assert.throws(() => parseWorkflowExpression("trigger.__proto__.polluted"), /not allowed/);
    assert.throws(() => parseWorkflowExpression("trigger[missing]"), /quoted property/);
    assert.throws(
      () => resolveWorkflowTemplate("{{ trigger.customerId", context),
      /closing braces/
    );
  });

  it("validates references against previously available steps", () => {
    assert.deepEqual(
      validateWorkflowTemplateReferences(
        "{{ steps.fetch-customer.output.email }}",
        new Set(["fetch-customer"]),
        "steps[1].config.url"
      ),
      []
    );
    assert.deepEqual(
      validateWorkflowTemplateReferences(
        "{{ steps.future.output.email }}",
        new Set(["fetch-customer"]),
        "steps[1].config.url"
      ),
      [
        {
          path: "steps[1].config.url",
          message: 'Expression references unavailable previous step "future"'
        }
      ]
    );
  });
});

describe("structured output schemas", () => {
  const schema = {
    type: "object",
    properties: {
      score: { type: "number" },
      email: { type: "string" }
    },
    required: ["score", "email"],
    additionalProperties: false
  };

  it("compiles object-root JSON Schemas", () => {
    assert.deepEqual(validateStructuredOutputSchema(schema), { valid: true });
    assert.equal(validateStructuredOutputSchema({ type: "string" }).valid, false);
    assert.equal(
      validateStructuredOutputSchema({
        type: "object",
        properties: { optional: { type: "string" } }
      }).valid,
      false
    );
  });

  it("validates structured output values", () => {
    assert.deepEqual(
      validateStructuredOutput(schema, { score: 92, email: "a@example.com" }),
      { valid: true }
    );
    assert.equal(validateStructuredOutput(schema, { score: "high" }).valid, false);
  });
});

describe("workflow expression validation", () => {
  it("allows references to earlier steps and rejects future references", () => {
    const issues = validateWorkflowDefinitionSemantics([
      { key: "fetch", type: "http", config: { url: "https://example.com", headers: {} } },
      {
        key: "analyze",
        type: "ai",
        config: {
          systemPrompt: "Analyze the customer",
          userPrompt: "{{ steps.fetch.output.email }}",
          outputSchema: {
            type: "object",
            properties: { score: { type: "number" } },
            required: ["score"],
            additionalProperties: false
          }
        }
      },
      {
        key: "notify",
        type: "http",
        config: {
          url: "https://example.com/{{ steps.future.output.id }}",
          headers: {},
          body: { score: "{{ steps.analyze.output.score }}" }
        }
      }
    ]);

    assert.deepEqual(issues, [
      {
        path: "steps[2].config.url",
        message: 'Expression references unavailable previous step "future"'
      }
    ]);
  });
});
