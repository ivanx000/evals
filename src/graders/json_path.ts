import { JSONPath } from "jsonpath-plus";
import type { JsonPathCriteria, GraderResult } from "../types.js";
import { extractJson } from "./utils.js";

export async function gradeJsonPath(
  output: string,
  criteria: JsonPathCriteria
): Promise<GraderResult> {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "json_path", passed: false, error: "Output is not a string" };
    }

    const text = criteria.extract_json ? extractJson(output) : output;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch (err) {
      return {
        criteria_type: "json_path",
        passed: false,
        detail: `JSON parse error: ${(err as Error).message}`,
      };
    }

    let values: unknown[];
    try {
      values = JSONPath({ path: criteria.path, json: parsed as object });
    } catch (err) {
      return {
        criteria_type: "json_path",
        passed: false,
        error: `Invalid JSONPath expression "${criteria.path}": ${(err as Error).message}`,
      };
    }

    if (values.length === 0) {
      return {
        criteria_type: "json_path",
        passed: false,
        detail: `Path "${criteria.path}" not found in output`,
      };
    }

    const value = values[0];
    const display = JSON.stringify(value);

    if ("equals" in criteria && criteria.equals !== undefined) {
      const passed = value === criteria.equals;
      return {
        criteria_type: "json_path",
        passed,
        detail: passed
          ? `${criteria.path} = ${display}`
          : `${criteria.path} is ${display}, expected ${JSON.stringify(criteria.equals)}`,
      };
    }

    // Collect all applicable numeric conditions — evaluate all of them (AND logic)
    const failures: string[] = [];
    const details: string[] = [];
    let hasCondition = false;

    if ("gt" in criteria && criteria.gt !== undefined) {
      hasCondition = true;
      if (typeof value !== "number") {
        return {
          criteria_type: "json_path",
          passed: false,
          detail: `${criteria.path} is ${display} (not a number), cannot compare with gt`,
        };
      }
      if (value > criteria.gt) {
        details.push(`${criteria.path} = ${value} > ${criteria.gt}`);
      } else {
        failures.push(`${criteria.path} = ${value} is not > ${criteria.gt}`);
      }
    }

    if ("gte" in criteria && criteria.gte !== undefined) {
      hasCondition = true;
      if (typeof value !== "number") {
        return {
          criteria_type: "json_path",
          passed: false,
          detail: `${criteria.path} is ${display} (not a number), cannot compare with gte`,
        };
      }
      if (value >= criteria.gte) {
        details.push(`${criteria.path} = ${value} >= ${criteria.gte}`);
      } else {
        failures.push(`${criteria.path} = ${value} is not >= ${criteria.gte}`);
      }
    }

    if ("lt" in criteria && criteria.lt !== undefined) {
      hasCondition = true;
      if (typeof value !== "number") {
        return {
          criteria_type: "json_path",
          passed: false,
          detail: `${criteria.path} is ${display} (not a number), cannot compare with lt`,
        };
      }
      if (value < criteria.lt) {
        details.push(`${criteria.path} = ${value} < ${criteria.lt}`);
      } else {
        failures.push(`${criteria.path} = ${value} is not < ${criteria.lt}`);
      }
    }

    if ("lte" in criteria && criteria.lte !== undefined) {
      hasCondition = true;
      if (typeof value !== "number") {
        return {
          criteria_type: "json_path",
          passed: false,
          detail: `${criteria.path} is ${display} (not a number), cannot compare with lte`,
        };
      }
      if (value <= criteria.lte) {
        details.push(`${criteria.path} = ${value} <= ${criteria.lte}`);
      } else {
        failures.push(`${criteria.path} = ${value} is not <= ${criteria.lte}`);
      }
    }

    if (hasCondition) {
      const passed = failures.length === 0;
      return {
        criteria_type: "json_path",
        passed,
        detail: passed ? details.join(", ") : failures.join("; "),
      };
    }

    if ("contains" in criteria && criteria.contains !== undefined) {
      if (Array.isArray(value)) {
        const needle = criteria.contains;
        const passed = value.some((item) => item === needle);
        return {
          criteria_type: "json_path",
          passed,
          detail: passed
            ? `${criteria.path} contains ${JSON.stringify(needle)}`
            : `${criteria.path} does not contain ${JSON.stringify(needle)}`,
        };
      }
      if (typeof value === "string") {
        const needle = String(criteria.contains);
        const passed = value.includes(needle);
        return {
          criteria_type: "json_path",
          passed,
          detail: passed
            ? `${criteria.path} contains "${needle}"`
            : `${criteria.path} = ${display} does not contain "${needle}"`,
        };
      }
      return {
        criteria_type: "json_path",
        passed: false,
        detail: `${criteria.path} is ${display} (not a string or array), cannot use contains`,
      };
    }

    return { criteria_type: "json_path", passed: false, error: "No condition specified (need equals, gt, gte, lt, lte, or contains)" };
  } catch (err) {
    return { criteria_type: "json_path", passed: false, error: (err as Error).message };
  }
}
