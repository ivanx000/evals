import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import { generateSuiteYaml, defaultModelFor, isInitProvider, INIT_PROVIDERS } from "../src/init.js";
import { EvalSuiteSchema } from "../src/types.js";

describe("generateSuiteYaml", () => {
  it("produces YAML that parses and validates against EvalSuiteSchema", () => {
    const content = generateSuiteYaml({
      name: "my-suite",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      description: "my-suite evaluation suite",
    });

    const parsed = yaml.load(content);
    const result = EvalSuiteSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("includes the requested provider, model, and description", () => {
    const content = generateSuiteYaml({
      name: "my-suite",
      provider: "openai",
      model: "gpt-4o-mini",
      description: "A custom description",
    });

    expect(content).toContain("provider: openai");
    expect(content).toContain("model: gpt-4o-mini");
    expect(content).toContain('description: "A custom description"');
  });

  it("escapes double quotes in name and description", () => {
    const content = generateSuiteYaml({
      name: 'weird "name"',
      provider: "anthropic",
      model: "claude-haiku-4-5",
      description: 'has a "quote" in it',
    });

    const parsed = yaml.load(content) as { name: string; description: string };
    expect(parsed.name).toBe('weird "name"');
    expect(parsed.description).toBe('has a "quote" in it');
  });

  it("comments out the additional example cases so only one case runs by default", () => {
    const content = generateSuiteYaml({
      name: "my-suite",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      description: "my-suite evaluation suite",
    });

    const parsed = yaml.load(content) as { cases: unknown[] };
    expect(parsed.cases).toHaveLength(1);
    expect(content).toContain("# - id: \"example-contains\"");
    expect(content).toContain("# - id: \"example-llm-judge\"");
  });
});

describe("defaultModelFor", () => {
  it("returns a distinct sensible default for each provider", () => {
    const defaults = INIT_PROVIDERS.map((p) => defaultModelFor(p));
    expect(new Set(defaults).size).toBe(INIT_PROVIDERS.length);
  });
});

describe("isInitProvider", () => {
  it("accepts known providers and rejects unknown ones", () => {
    expect(isInitProvider("anthropic")).toBe(true);
    expect(isInitProvider("ollama")).toBe(true);
    expect(isInitProvider("bedrock")).toBe(false);
  });
});
