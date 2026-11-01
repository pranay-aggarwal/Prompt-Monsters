import type { IncomingMessage, ServerResponse } from "node:http";
import type { BattleActionId, MonsterId, ResearchResult, SuggestedMonsterAction } from "../src/shared/types";

const MAX_BODY_BYTES = 16_000;
const PROVIDER_TIMEOUT_MS = 8_000;
const MAX_EXA_RESULTS = 3;
const MAX_OPENAI_CALLS = 3;
const MAX_EXA_CALLS = 1;
const allowedActionIds = new Set<BattleActionId>([
  "basic_attack",
  "soli_echo_cheer",
  "astra_galaxy_brain",
  "giptoo_pattern_echo",
  "sori_scene_shift",
  "coddy_patch_pounce",
]);
const knownMonsterIds = new Set<MonsterId>(["soli", "astra", "giptoo", "sori", "coddy"]);
const battleUsage = new Map<string, { exa: number; openAi: number }>();

type JsonRecord = Record<string, unknown>;

function json(response: ServerResponse, status: number, body: JsonRecord) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function getBattleUsage(request: IncomingMessage) {
  const id = typeof request.headers["x-battle-id"] === "string" ? request.headers["x-battle-id"].slice(0, 80) : "anonymous";
  const current = battleUsage.get(id) ?? { exa: 0, openAi: 0 };
  battleUsage.set(id, current);
  return current;
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
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object.");
  return parsed as JsonRecord;
}

function stringField(body: JsonRecord, key: string, maxLength: number) {
  const value = body[key];
  return typeof value === "string" && value.trim().length <= maxLength ? value.trim() : null;
}

function timeoutSignal() {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown source";
  }
}

async function searchExa(query: string): Promise<ResearchResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Exa is not configured.");
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    signal: timeoutSignal(),
    body: JSON.stringify({ query, type: "auto", numResults: MAX_EXA_RESULTS, contents: { highlights: true } }),
  });
  if (!response.ok) throw new Error(`Exa request failed with ${response.status}.`);
  const payload = (await response.json()) as { results?: Array<JsonRecord> };
  return (payload.results ?? []).slice(0, MAX_EXA_RESULTS).flatMap((item, index) => {
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? item.title : "Untitled source";
    if (!url || !/^https?:\/\//i.test(url)) return [];
    const highlights = Array.isArray(item.highlights) ? item.highlights.filter((value): value is string => typeof value === "string") : [];
    const excerpt = highlights[0] ?? (typeof item.text === "string" ? item.text.slice(0, 420) : null);
    return [{
      id: typeof item.id === "string" ? item.id : `source-${index + 1}`,
      title,
      url,
      domain: domainFromUrl(url),
      publishedDate: typeof item.publishedDate === "string" ? item.publishedDate : null,
      excerpt,
    }];
  });
}

function validEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EXA_RESULTS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as JsonRecord;
    const title = typeof source.title === "string" ? source.title.slice(0, 240) : "";
    const url = typeof source.url === "string" && /^https?:\/\//i.test(source.url) ? source.url : "";
    const excerpt = typeof source.excerpt === "string" ? source.excerpt.slice(0, 600) : "";
    return title && url ? [{ title, url, excerpt }] : [];
  });
}

async function interpretWithOpenAi(body: JsonRecord) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI is not configured.");
  const instruction = stringField(body, "instruction", 2_000);
  const bossId = stringField(body, "bossId", 40);
  const battleSummary = stringField(body, "battleSummary", 1_000);
  const selected = Array.isArray(body.selectedMonsterIds)
    ? body.selectedMonsterIds.filter((value): value is MonsterId => typeof value === "string" && knownMonsterIds.has(value as MonsterId)).slice(0, 3)
    : [];
  if (!instruction || bossId !== "kween" || !battleSummary || selected.length !== 3 || new Set(selected).size !== 3) {
    throw new Error("Invalid battle interpretation request.");
  }
  const evidence = validEvidence(body.evidence);
  const allowedForPrompt = [...allowedActionIds];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: timeoutSignal(),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions: `You interpret one turn in a deterministic game. Return only actions that use selected living-team IDs and the allowed action IDs. Never invent citations. If evidence is present, use only its supplied text. Allowed monster IDs: ${selected.join(", ")}. Allowed action IDs: ${allowedForPrompt.join(", ")}. Return at most two actions with different monsters.`,
      input: JSON.stringify({ instruction, battleSummary, evidence }),
      text: {
        format: {
          type: "json_schema",
          name: "battle_suggestion",
          strict: true,
          schema: {
            type: "object",
            properties: {
              actions: { type: "array", items: { type: "object", properties: { monsterId: { type: "string", enum: selected }, actionId: { type: "string", enum: allowedForPrompt } }, required: ["monsterId", "actionId"], additionalProperties: false } },
              explanation: { type: "string" },
            },
            required: ["actions", "explanation"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed with ${response.status}.`);
  const payload = (await response.json()) as JsonRecord;
  const outputText = typeof payload.output_text === "string"
    ? payload.output_text
    : Array.isArray(payload.output)
      ? payload.output.flatMap((item) => item && typeof item === "object" && Array.isArray((item as JsonRecord).content) ? (item as JsonRecord).content : []).map((item) => item && typeof item === "object" && typeof (item as JsonRecord).text === "string" ? (item as JsonRecord).text : "").join("")
      : "";
  if (!outputText) throw new Error("OpenAI returned no structured output.");
  const parsed: unknown = JSON.parse(outputText);
  if (!parsed || typeof parsed !== "object") throw new Error("OpenAI returned invalid output.");
  return parsed as JsonRecord;
}

function validateActions(value: unknown, selected: MonsterId[]) {
  if (!value || typeof value !== "object") return [];
  const actions: unknown[] = Array.isArray((value as JsonRecord).actions) ? (value as JsonRecord).actions as unknown[] : [];
  const seen = new Set<string>();
  return actions.slice(0, 2).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const action = item as JsonRecord;
    const monsterId = action.monsterId;
    const actionId = action.actionId;
    if (typeof monsterId !== "string" || typeof actionId !== "string" || !selected.includes(monsterId as MonsterId) || !allowedActionIds.has(actionId as BattleActionId) || seen.has(monsterId)) return [];
    seen.add(monsterId);
    return [{ monsterId: monsterId as MonsterId, actionId: actionId as BattleActionId } satisfies SuggestedMonsterAction];
  });
}

export function apiMiddleware() {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    if (!request.url?.startsWith("/api/")) return next();
    if (request.method !== "POST") return json(response, 405, { ok: false, error: "Only POST is supported." });
    try {
      const body = await readJson(request);
      const usage = getBattleUsage(request);
      if (request.url === "/api/research/search") {
        if (usage.exa >= MAX_EXA_CALLS) return json(response, 429, { ok: false, error: "Evidence Hunt is limited to one search per battle." });
        const query = stringField(body, "query", 500);
        if (!query) return json(response, 400, { ok: false, error: "A short research query is required." });
        usage.exa += 1;
        const results = await searchExa(query);
        return json(response, 200, { ok: true, results });
      }
      if (request.url === "/api/battle/interpret") {
        if (usage.openAi >= MAX_OPENAI_CALLS) return json(response, 429, { ok: false, error: "Strategy interpretation is limited to three calls per battle." });
        usage.openAi += 1;
        const selected = Array.isArray(body.selectedMonsterIds) ? body.selectedMonsterIds.filter((value): value is MonsterId => typeof value === "string" && knownMonsterIds.has(value as MonsterId)).slice(0, 3) : [];
        if (selected.length !== 3 || new Set(selected).size !== 3) return json(response, 400, { ok: false, error: "Exactly three distinct selected monsters are required." });
        const result = await interpretWithOpenAi(body);
        const actions = validateActions(result, selected);
        const explanation = typeof result.explanation === "string" ? result.explanation.slice(0, 500) : "The strategy was interpreted into a safe game action.";
        if (!actions.length) return json(response, 422, { ok: false, error: "The provider returned no permitted action." });
        return json(response, 200, { ok: true, actions, explanation });
      }
      return json(response, 404, { ok: false, error: "Unknown API route." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed.";
      return json(response, 503, { ok: false, error: message.includes("configured") ? message : "Optional provider unavailable. Continue with the local evaluator." });
    }
  };
}
