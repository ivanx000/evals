/**
 * Example custom grader plugin: sentiment analysis via keyword heuristics.
 *
 * Usage in YAML:
 *   criteria:
 *     - type: sentiment
 *       expected: positive   # or "negative" or "neutral"
 *
 * Drop this file into a `graders/` folder next to your eval YAML and the
 * framework will pick it up automatically — no code changes needed.
 */

const POSITIVE_WORDS = [
  "good", "great", "excellent", "wonderful", "amazing", "fantastic", "love",
  "happy", "joy", "positive", "best", "awesome", "superb", "brilliant",
  "outstanding", "perfect", "glad", "pleased", "delighted", "success",
];

const NEGATIVE_WORDS = [
  "bad", "terrible", "awful", "horrible", "hate", "worst", "poor", "sad",
  "angry", "negative", "disappointing", "failure", "wrong", "ugly", "broken",
  "useless", "terrible", "dreadful", "miserable", "disaster",
];

function detectSentiment(text) {
  const lower = text.toLowerCase();
  const words = lower.match(/\b\w+\b/g) ?? [];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.includes(word)) positiveCount++;
    if (NEGATIVE_WORDS.includes(word)) negativeCount++;
  }

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

export default {
  type: "sentiment",

  run: async (output, config) => {
    const expected = config.expected;
    if (!expected || !["positive", "negative", "neutral"].includes(expected)) {
      return {
        criteria_type: "sentiment",
        passed: false,
        error: `Invalid expected sentiment: "${expected}". Must be positive, negative, or neutral.`,
      };
    }

    const detected = detectSentiment(output);
    const passed = detected === expected;

    return {
      criteria_type: "sentiment",
      passed,
      detail: `Detected: ${detected} (expected: ${expected})`,
    };
  },
};
