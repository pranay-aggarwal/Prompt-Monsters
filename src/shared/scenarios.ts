import type { ChallengeScenario } from "./types";

export const KWEEN_SCENARIOS: ChallengeScenario[] = [
  {
    id: "benchmark-general-intelligence",
    bossId: "kween",
    claim: "A high score on one AI benchmark proves that a system is generally intelligent.",
    context: "Kween has performed well on a selected set of benchmark tasks and wants to generalise that result to every kind of intelligence.",
    difficulty: "medium",
    rubric: ["Separate task performance from general intelligence", "Identify assumptions and limits", "Use evidence or a testable qualification when helpful"],
    evidenceRequirement: "recommended",
  },
  {
    id: "confident-citations-trust",
    bossId: "kween",
    claim: "An AI answer that sounds confident and includes citations can be trusted without further verification.",
    context: "Kween argues that confidence and the presence of links are enough to establish that an answer is reliable.",
    difficulty: "hard",
    rubric: ["Distinguish confidence from accuracy", "Check whether sources actually support the claim", "Give a practical verification condition"],
    evidenceRequirement: "recommended",
  },
  {
    id: "longer-prompts-better",
    bossId: "kween",
    claim: "A longer, more detailed prompt always produces a better answer.",
    context: "Kween has filled its prompt with unnecessary detail and treats length as a guarantee of quality.",
    difficulty: "easy",
    rubric: ["Prioritise a clear objective", "Prefer relevant context and constraints over filler", "State when a shorter prompt would be better"],
    evidenceRequirement: "optional",
  },
];
