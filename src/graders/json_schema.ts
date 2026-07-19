import Ajv from "ajv";
import type { JsonSchemaCriteria, GraderResult } from "../types.js";

function extractJson(output: string): string {
  const jsonFence = output.match(/```json\s*\n([\s\S]*?)```/i);
  if (jsonFence) return jsonFence[1];
  const genericFence = output.match(/```(?:\w*\n)?([\s\S]*?)```/);
  if (genericFence) return genericFence[1];
  return output;
}

export async function gradeJsonSchema(
  output: string,
  criteria: JsonSchemaCriteria
): Promise<GraderResult> {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "json_schema", passed: false, error: "Output is not a string" };
    }

    const text = criteria.extract_json ? extractJson(output) : output;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch (err) {
      return {
        criteria_type: "json_schema",
        passed: false,
        detail: `JSON parse error: ${(err as Error).message}`,
      };
    }

    const ajv = new Ajv();
    const validate = ajv.compile(criteria.schema);
    const valid = validate(parsed);

    if (!valid) {
      const messages = (validate.errors ?? [])
        .map((e) => `${e.instancePath || "(root)"} ${e.message}`)
        .join("; ");
      return {
        criteria_type: "json_schema",
        passed: false,
        detail: `Schema violations: ${messages}`,
      };
    }

    return {
      criteria_type: "json_schema",
      passed: true,
      detail: "JSON valid, schema matched",
    };
  } catch (err) {
    return { criteria_type: "json_schema", passed: false, error: (err as Error).message };
  }
}
