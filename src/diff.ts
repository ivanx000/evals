import type { RunResult, DiffResult, DiffEntry } from "./types.js";

export function computeDiff(baseline: RunResult, candidate: RunResult): DiffResult {
  const baselineMap = new Map(baseline.cases.map((c) => [c.case_id, c]));
  const candidateMap = new Map(candidate.cases.map((c) => [c.case_id, c]));

  const regressions: DiffEntry[] = [];
  const improvements: DiffEntry[] = [];
  const removed_cases: string[] = [];
  const added_cases: string[] = [];
  let unchanged_count = 0;

  // Cases present in baseline
  for (const [caseId, baseCase] of baselineMap) {
    const candCase = candidateMap.get(caseId);
    if (!candCase) {
      removed_cases.push(caseId);
      continue;
    }

    // Compare per-grader results
    const baseGraders = new Map(baseCase.grader_results.map((g) => [g.criteria_type, g]));
    const candGraders = new Map(candCase.grader_results.map((g) => [g.criteria_type, g]));

    // All grader types across both runs
    const allTypes = new Set([...baseGraders.keys(), ...candGraders.keys()]);

    for (const criteriaType of allTypes) {
      const base = baseGraders.get(criteriaType);
      const cand = candGraders.get(criteriaType);

      const basePassed = base?.passed ?? false;
      const candPassed = cand?.passed ?? false;

      if (basePassed && !candPassed) {
        regressions.push({
          case_id: caseId,
          criteria_type: criteriaType,
          baseline_passed: true,
          candidate_passed: false,
          status: "regression",
        });
      } else if (!basePassed && candPassed) {
        improvements.push({
          case_id: caseId,
          criteria_type: criteriaType,
          baseline_passed: false,
          candidate_passed: true,
          status: "improvement",
        });
      } else {
        unchanged_count++;
      }
    }
  }

  // Cases added in candidate
  for (const caseId of candidateMap.keys()) {
    if (!baselineMap.has(caseId)) {
      added_cases.push(caseId);
    }
  }

  return {
    baseline_run_id: baseline.run_id,
    candidate_run_id: candidate.run_id,
    regressions,
    improvements,
    removed_cases,
    added_cases,
    unchanged_count,
  };
}
