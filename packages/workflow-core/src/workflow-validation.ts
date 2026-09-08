import { validateWorkflowTemplateReferences, type WorkflowExpressionIssue } from "./expressions.js";
import { validateStructuredOutputSchema } from "./json-schema.js";

export type WorkflowStepForValidation = {
  key: string;
  type: string;
  config: Record<string, unknown>;
};

export function validateWorkflowDefinitionSemantics(
  steps: readonly WorkflowStepForValidation[]
): WorkflowExpressionIssue[] {
  const availableStepKeys = new Set<string>();
  const issues: WorkflowExpressionIssue[] = [];

  steps.forEach((step, index) => {
    const configPath = `steps[${index}].config`;

    if (step.type === "http") {
      issues.push(
        ...validateWorkflowTemplateReferences(
          step.config.url,
          availableStepKeys,
          `${configPath}.url`
        )
      );

      if (isPlainObject(step.config.headers)) {
        for (const [name, value] of Object.entries(step.config.headers)) {
          issues.push(
            ...validateWorkflowTemplateReferences(
              value,
              availableStepKeys,
              `${configPath}.headers.${name}`
            )
          );
        }
      }

      issues.push(
        ...validateWorkflowTemplateReferences(
          step.config.body,
          availableStepKeys,
          `${configPath}.body`
        )
      );
    }

    if (step.type === "ai") {
      issues.push(
        ...validateWorkflowTemplateReferences(
          step.config.systemPrompt,
          availableStepKeys,
          `${configPath}.systemPrompt`
        ),
        ...validateWorkflowTemplateReferences(
          step.config.userPrompt,
          availableStepKeys,
          `${configPath}.userPrompt`
        )
      );

      const schemaResult = validateStructuredOutputSchema(step.config.outputSchema);

      if (!schemaResult.valid) {
        issues.push(
          ...schemaResult.errors.map((message) => ({
            path: `${configPath}.outputSchema`,
            message
          }))
        );
      }
    }

    availableStepKeys.add(step.key);
  });

  return issues;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
