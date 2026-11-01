import type { IncomingMessage, ServerResponse } from "node:http";
import { KWEEN_SCENARIOS } from "../src/shared/scenarios";
import { MONSTERS } from "../src/shared/monsters";
import type { AIProviderId, BattleActionId, JudgeEvaluation, MonsterId, MonsterTurnOutput, ProposedMonsterAction, ResearchResult, SelectedTeam } from "../src/shared/types";

const MAX_BODY_BYTES = 24_000;
const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_EXA_RESULTS = 3;
const MAX_LIVE_TURNS = 4;
const MAX_EXA_CALLS = 1;
const monsterIds = new Set<MonsterId>(MONSTERS.map((monster) => monster.id));
const abilityIds = new Set<BattleActionId>(MONSTERS.map((monster) => monster.abilityId as BattleActionId));
const battleUsage = new Map<string, { liveTurns: number; exa: number }>();
type JsonRecord = Record<string, unknown>;

function json(response: ServerResponse, status: number, body: JsonRecord) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function usageFor(request: IncomingMessage) {
  const battleId = typeof request.headers["x-battle-id"] === "string" ? request.headers["x-battle-id"].slice(0, 80) : "anonymous";
  const usage = battleUsage.get(battleId) ?? { liveTurns: 0, exa: 0 };
  battleUsage.set(battleId, usage);
  return usage;
}

async function readJson(request: IncomingMessage) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY_BYTES) throw new Error("Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {} as JsonRecord;
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object.");
  return parsed as JsonRecord;
}

function stringField(body: JsonRecord, key: string, max: number) {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

function timeoutSignal() { return AbortSignal.timeout(PROVIDER_TIMEOUT_MS); }

function domainFromUrl(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown source"; }
}

function scenarioFor(id: string | null) { return KWEEN_SCENARIOS.find((scenario) => scenario.id === id) ?? null; }

function selectedTeam(value: unknown): SelectedTeam | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((id): id is MonsterId => typeof id === "string" && monsterIds.has(id as MonsterId))) return null;
  if (new Set(value).size !== 3) return null;
  return value as SelectedTeam;
}

function providerConfig() {
  const provider = process.env.AI_PROVIDER as AIProviderId | undefined;
  if (provider !== "openai" && provider !== "cerebras") throw new Error("No supported AI_PROVIDER is configured.");
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.CEREBRAS_API_KEY;
  const model = provider === "openai" ? process.env.OPENAI_MODEL : process.env.CEREBRAS_MODEL;
  const judgeModel = provider === "openai" ? process.env.OPENAI_JUDGE_MODEL : process.env.CEREBRAS_JUDGE_MODEL;
  if (!key || !model) throw new Error(`${provider} provider is not fully configured.`);
  return { provider, key, model, judgeModel: judgeModel || model };
}

const actionSchema = {
  type: "object",
  properties: { monsterId: { type: "string", enum: [...monsterIds] }, actionId: { type: "string", enum: [...abilityIds] } },
  required: ["monsterId", "actionId"],
  additionalProperties: false,
};

const responseSchema = {
  type: "object",
  properties: {
    monsterResponse: { type: "string" },
    argument: { type: "string" },
    proposedActions: { type: "array", items: actionSchema },
  },
  required: ["monsterResponse", "argument", "proposedActions"],
  additionalProperties: false,
};

const judgeSchema = {
  type: "object",
  properties: {
    relevance: { type: "number" }, reasoning: { type: "number" }, counterargument: { type: "number" },
    evidence: { type: ["number", "null"] }, clarity: { type: "number" }, promptQuality: { type: "number" },
    strength: { type: "string" }, improvementTip: { type: "string" },
  },
  required: ["relevance", "reasoning", "counterargument", "evidence", "clarity", "promptQuality", "strength", "improvementTip"],
  additionalProperties: false,
};

function structuredBody(provider: "openai" | "cerebras", model: string, system: string, input: string, schemaName: string, schema: JsonRecord) {
  if (provider === "openai") return { model, instructions: system, input, text: { format: { type: "json_schema", name: schemaName, strict: true, schema } } };
  return { model, messages: [{ role: "system", content: `${system}\nReturn JSON only.` }, { role: "user", content: input }], response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } };
}

function responseText(payload: JsonRecord): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.output)) return payload.output.flatMap((item) => item && typeof item === "object" && Array.isArray((item as JsonRecord).content) ? (item as JsonRecord).content : []).map((item) => item && typeof item === "object" && typeof (item as JsonRecord).text === "string" ? (item as JsonRecord).text : "").join("");
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const content = choices[0] && typeof choices[0] === "object" ? (choices[0] as JsonRecord).message : null;
  return content && typeof content === "object" && typeof (content as JsonRecord).content === "string" ? (content as JsonRecord).content as string : "";
}

async function callProvider(config: ReturnType<typeof providerConfig>, model: string, system: string, input: string, schemaName: string, schema: JsonRecord) {
  const endpoint = config.provider === "openai" ? "https://api.openai.com/v1/responses" : "https://api.cerebras.ai/v1/chat/completions";
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` }, signal: timeoutSignal(), body: JSON.stringify(structuredBody(config.provider, model, system, input, schemaName, schema)) });
  if (!response.ok) throw new Error(`${config.provider} request failed with ${response.status}.`);
  const payload = (await response.json()) as JsonRecord;
  const text = responseText(payload);
  if (!text) throw new Error(`${config.provider} returned no structured output.`);
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("Provider returned invalid JSON.");
  return parsed as JsonRecord;
}

async function searchExa(query: string): Promise<ResearchResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Exa is not configured.");
  const response = await fetch("https://api.exa.ai/search", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, signal: timeoutSignal(), body: JSON.stringify({ query: query.slice(0, 700), type: "auto", numResults: MAX_EXA_RESULTS, contents: { highlights: true } }) });
  if (!response.ok) throw new Error(`Exa request failed with ${response.status}.`);
  const payload = (await response.json()) as { results?: Array<JsonRecord> };
  return (payload.results ?? []).slice(0, MAX_EXA_RESULTS).flatMap((item, index) => {
    const url = typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? item.url : "";
    if (!url) return [];
    const highlights = Array.isArray(item.highlights) ? item.highlights.filter((value): value is string => typeof value === "string") : [];
    return [{ id: typeof item.id === "string" ? item.id : `source-${index + 1}`, title: typeof item.title === "string" ? item.title : "Untitled source", url, domain: domainFromUrl(url), publishedDate: typeof item.publishedDate === "string" ? item.publishedDate : null, excerpt: highlights[0] ?? (typeof item.text === "string" ? item.text.slice(0, 500) : null) }];
  });
}

function validatedActions(value: unknown, team: SelectedTeam, active: MonsterId, partner?: MonsterId): ProposedMonsterAction[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as JsonRecord).proposedActions)) return [];
  const result: ProposedMonsterAction[] = [];
  for (const item of ((value as JsonRecord).proposedActions as unknown[]).slice(0, 2)) {
    if (!item || typeof item !== "object") continue;
    const action = item as JsonRecord;
    const monsterId = action.monsterId;
    const actionId = action.actionId;
    const expected = typeof monsterId === "string" ? MONSTERS.find((monster) => monster.id === monsterId)?.abilityId : null;
    if (typeof monsterId !== "string" || typeof actionId !== "string" || !team.includes(monsterId as MonsterId) || !abilityIds.has(actionId as BattleActionId) || expected !== actionId || result.some((entry) => entry.monsterId === monsterId) || (monsterId !== active && monsterId !== partner)) continue;
    result.push({ monsterId: monsterId as MonsterId, actionId: actionId as BattleActionId });
  }
  return result;
}

function validJudge(value: unknown, evidenceRequired: boolean): JudgeEvaluation | null {
  if (!value || typeof value !== "object") return null;
  const data = value as JsonRecord;
  const numeric = ["relevance", "reasoning", "counterargument", "clarity", "promptQuality"];
  if (!numeric.every((key) => typeof data[key] === "number" && Number.isFinite(data[key]) && (data[key] as number) >= 0 && (data[key] as number) <= 100)) return null;
  if (data.evidence !== null && (typeof data.evidence !== "number" || !Number.isFinite(data.evidence) || data.evidence < 0 || data.evidence > 100)) return null;
  if (evidenceRequired && data.evidence === null) return null;
  if (typeof data.strength !== "string" || typeof data.improvementTip !== "string") return null;
  return { relevance: data.relevance as number, reasoning: data.reasoning as number, counterargument: data.counterargument as number, evidence: data.evidence as number | null, clarity: data.clarity as number, promptQuality: data.promptQuality as number, strength: (data.strength as string).slice(0, 400), improvementTip: (data.improvementTip as string).slice(0, 400) };
}

export function apiMiddleware() {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    if (!request.url?.startsWith("/api/")) return next();
    if (request.method !== "POST") return json(response, 405, { ok: false, error: "Only POST is supported." });
    try {
      const body = await readJson(request);
      if (request.url !== "/api/battle/turn") return json(response, 404, { ok: false, error: "Unknown API route." });
      const scenario = scenarioFor(stringField(body, "scenarioId", 100));
      const instruction = stringField(body, "instruction", 3_000);
      const active = stringField(body, "activeMonsterId", 20) as MonsterId | null;
      const partnerValue = body.partnerMonsterId;
      const partner = partnerValue === undefined ? undefined : typeof partnerValue === "string" ? partnerValue as MonsterId : null;
      const team = selectedTeam(body.selectedMonsterIds);
      const requestResearch = body.requestResearch;
      if (!scenario || !instruction || !active || !monsterIds.has(active) || !team || !team.includes(active) || (partner !== undefined && (!partner || !team.includes(partner) || partner === active)) || typeof requestResearch !== "boolean") return json(response, 400, { ok: false, error: "Invalid battle turn request." });
      const usage = usageFor(request);
      if (usage.liveTurns >= MAX_LIVE_TURNS) return json(response, 429, { ok: false, error: "Live turn allowance used. Continue in Offline Practice Mode." });
      usage.liveTurns += 1;
      const config = providerConfig();
      let researchResults: ResearchResult[] = [];
      let researchNotice = "";
      if (requestResearch && usage.exa >= MAX_EXA_CALLS) researchNotice = "Research allowance used for this encounter; continuing without a new search.";
      else if (requestResearch) { usage.exa += 1; try { researchResults = await searchExa(`${scenario.claim} ${scenario.context} ${instruction}`); } catch { researchNotice = "Exa research was unavailable; continuing without new evidence."; } }
      const activeProfile = MONSTERS.find((monster) => monster.id === active)!;
      const partnerProfile = partner ? MONSTERS.find((monster) => monster.id === partner) : null;
      const turnInput = JSON.stringify({ scenario, instruction, activeMonster: activeProfile, partnerMonster: partnerProfile, selectedMonsterIds: team, researchResults });
      const monsterSystem = "You are the active Prompt Monsters creature. Address Kween's authored claim accurately and substantively. Stay in the canonical personality and reasoning approach, but never invent evidence, citations, abilities, or rules. Return only the requested JSON shape. Proposed actions must use the active monster and may include the requested partner only.";
      const monsterRaw = await callProvider(config, config.model, monsterSystem, turnInput, "monster_turn", responseSchema);
      const monsterResponse = typeof monsterRaw.monsterResponse === "string" ? monsterRaw.monsterResponse.slice(0, 2_000) : "";
      const argument = typeof monsterRaw.argument === "string" ? monsterRaw.argument.slice(0, 2_000) : "";
      const proposedActions = validatedActions(monsterRaw, team, active, partner ?? undefined);
      if (!monsterResponse || !argument || !proposedActions.some((action) => action.monsterId === active)) throw new Error("Monster response did not contain a valid active action.");
      const judgeRaw = await callProvider(config, config.judgeModel, "You are a neutral evaluator for a prompt-driven argument game. Do not roleplay, mention providers, invent evidence, or decide game state. Score only the supplied prompt and argument against the authored scenario. Return only the required JSON shape.", JSON.stringify({ scenario, instruction, argument, researchResults }), "judge_evaluation", judgeSchema);
      const evaluation = validJudge(judgeRaw, scenario.evidenceRequirement === "required" || (scenario.evidenceRequirement === "recommended" && requestResearch));
      if (!evaluation) throw new Error("Judge returned invalid evaluation.");
      const output: MonsterTurnOutput = { monsterResponse, argument, proposedActions };
      return json(response, 200, { ok: true, mode: "live", ...output, researchResults, researchNotice, evaluation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live provider unavailable.";
      return json(response, 503, { ok: false, mode: "offline", error: message.includes("configured") ? message : "Live AI unavailable. Continue in Offline Practice Mode." });
    }
  };
}
