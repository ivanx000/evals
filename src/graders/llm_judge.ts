import Anthropic from "@anthropic-ai/sdk";
import type { LLMJudgeCriteria, GraderResult } from "../types.js";

const JUDGE_SYSTEM = `You are a strict LLM output evaluator. Score the given output on a scale of 1-5 based on the rubric provided.

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{"score": <1-5>, "reasoning": "<one concise sentence>"}

Scoring guide:
1 = Completely fails the rubric
2 = Mostly fails with minor redeeming qualities
3 = Partially meets the rubric
4 = Mostly meets the rubric with minor issues
5 = Fully meets the rubric`;

export async function gradeLLMJudge(
  output: string,
  criteria: LLMJudgeCriteria,
  judgeModel?: string,
  apiKey?: string
): Promise<GraderResult> {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "llm_judge", passed: false, score: 0, error: "Output is not a string" };
    }

    const model = criteria.model ?? judgeModel ?? "claude-opus-4-8";
    const passThreshold = criteria.pass_threshold ?? 3;

    const resolvedApiKey = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!resolvedApiKey) {
      return {
        criteria_type: "llm_judge",
        passed: false,
        score: 0,
        error:
          "ANTHROPIC_API_KEY is not set. llm_judge always uses Anthropic.\n" +
          "  Set it with: export ANTHROPIC_API_KEY=sk-ant-...",
      };
    }

    const client = new Anthropic({ apiKey: resolvedApiKey });

    const userMessage = `Rubric: ${criteria.rubric}

Output to evaluate:
"""
${output}
"""`;

    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("") ?? "";

    const parsed = JSON.parse(rawText) as { score: number; reasoning: string };
    const score = Math.min(5, Math.max(1, Math.round(parsed.score)));
    const passed = score >= passThreshold;

    return {
      criteria_type: "llm_judge",
      passed,
      score,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    return {
      criteria_type: "llm_judge",
      passed: false,
      score: 0,
      error: `Judge error: ${(err as Error).message}`,
    };
  }
}
