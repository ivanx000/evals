export type InitProvider = "anthropic" | "openai" | "ollama" | "gemini";

export const INIT_PROVIDERS: readonly InitProvider[] = ["anthropic", "openai", "ollama", "gemini"];

const DEFAULT_MODELS: Record<InitProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  ollama: "llama3",
};

export function defaultModelFor(provider: InitProvider): string {
  return DEFAULT_MODELS[provider];
}

export function isInitProvider(value: string): value is InitProvider {
  return (INIT_PROVIDERS as readonly string[]).includes(value);
}

export interface InitSuiteOptions {
  name: string;
  provider: InitProvider;
  model: string;
  description: string;
}

// Escapes a value for use inside a double-quoted YAML scalar.
function yamlQuote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function generateSuiteYaml(opts: InitSuiteOptions): string {
  const { name, provider, model, description } = opts;

  return `name: "${yamlQuote(name)}"
description: "${yamlQuote(description)}"
provider: ${provider}
model: ${model}
system_prompt: "You are a helpful assistant."
max_tokens: 512

cases:
  - id: "example-exact-match"
    prompt: "What is the capital of France? Reply with just the city name."
    criteria:
      - type: exact_match
        value: "Paris"
        case_sensitive: false

  # Uncomment and adapt these to cover more of your own cases and grader types:

  # - id: "example-contains"
  #   prompt: "Name one primary color."
  #   criteria:
  #     - type: contains
  #       value: "red"
  #       case_sensitive: false

  # - id: "example-llm-judge"
  #   prompt: "Explain photosynthesis in one sentence."
  #   criteria:
  #     - type: llm_judge
  #       rubric: "The response should mention sunlight, water, and carbon dioxide converting to oxygen and energy."
  #       pass_threshold: 3
`;
}
