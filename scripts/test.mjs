import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createServer } from "vite";

// Vite's existing TS loader keeps tests dependency-free and uses the game modules themselves.
const vite = await createServer({ configFile: false, envFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
try {
  const g = await vite.ssrLoadModule("/src/game/battle.ts");
  const m = await vite.ssrLoadModule("/src/game/meadow.ts");
  const { MONSTERS } = await vite.ssrLoadModule("/src/shared/monsters.ts");
  const { KWEEN_SCENARIOS } = await vite.ssrLoadModule("/src/shared/scenarios.ts");
  const evaluation = n => ({ relevance: n, reasoning: n, counterargument: n, evidence: null, clarity: n, promptQuality: n, strength: "A testable goal.", improvementTip: "Check an assumption." });
  const initial = (team = ["astra", "coddy", "giptoo"]) => g.createBattle(team, KWEEN_SCENARIOS[0].id);
  const input = (s, options = {}) => {
    const instruction = options.instruction ?? `${g.monsterFor(s.activeMonsterId).name}, explain when Kween's claim could fail. Give one testable counterexample.${options.partner ? ` Work with ${g.monsterFor(options.partner).name}.` : ""}`;
    const turn = g.offlineTurn(s, instruction, options.partner);
    return { instruction, ...turn, mode: "offline", ...options };
  };
  await check("starting team, HP, shield and all three challenge cards", () => {
    const s = initial(); assert.equal(s.team.length, 3); assert.ok(s.team.every(m => m.hp === 30)); assert.equal(s.kweenHp, 100); assert.equal(s.kweenShield, 20); assert.equal(KWEEN_SCENARIOS.length, 3);
    assert.throws(() => initial(["astra", "astra", "coddy"])); assert.throws(() => initial(["astra", "coddy", "unknown"]));
  });
  await check("neutral weighting, N/A evidence redistribution, and exact damage bands", () => {
    assert.ok(Math.abs(g.scoreEvaluation(evaluation(80)) - 80) < .00001);
    assert.ok(Math.abs(g.scoreEvaluation({ ...evaluation(80), evidence: 80 }) - 80) < .00001);
    for (const [score, damage] of [[0, 6], [39.99, 6], [40, 16], [59.99, 16], [60, 24], [79.99, 24], [80, 30], [100, 30]]) assert.equal(g.damageForScore(score), damage);
    assert.equal(g.validEvaluation({ ...evaluation(80), damage: 999 }), false); assert.equal(g.validEvaluation({ ...evaluation(80), reasoning: NaN }), false); assert.equal(g.validEvaluation({ ...evaluation(80), reasoning: -1 }), false); assert.equal(g.validEvaluation({ ...evaluation(80), evidence: 101 }), false);
  });
  await check("shield absorbs base impact before HP; original state stays untouched", () => {
    const s = initial(); const before = structuredClone(s);
    const n = g.resolveTurn(s, input(s, { evaluation: evaluation(0) }));
    assert.equal(n.kweenHp, 100); assert.equal(n.kweenShield, 19); assert.deepEqual(s, before); assert.equal(n.turn, 2);
  });
  await check("Soli heals the most injured living ally, never revives, caps at 30", () => {
    const s = initial(["soli", "astra", "coddy"]); s.team[1].hp = 0; s.team[2].hp = 24;
    const n = g.resolveTurn(s, input(s)); assert.equal(n.team[1].hp, 0); assert.equal(n.team[2].hp, 30);
  });
  await check("Astra marks a bonus for the next turn, not the current argument", () => {
    const s = initial(); const n = g.resolveTurn(s, input(s, { evaluation: evaluation(0) }));
    assert.equal(n.history[0].impact, 6); assert.equal(n.bonusDamage, 5); assert.equal(n.revealedMove, "score_surge");
    const n2 = g.resolveTurn(n, input(n, { evaluation: evaluation(0) })); assert.equal(n2.history[1].impact, 11);
  });
  await check("Giptoo's prediction is checked against the actual move", () => {
    const s = initial(["giptoo", "astra", "coddy"]); s.patternIndex = 2;
    const right = input(s, { evaluation: evaluation(0) }); const n = g.resolveTurn(s, right); assert.equal(n.team[0].hp, 30);
    const n2 = g.resolveTurn(s, { ...right, output: { ...right.output, predictedMove: "score_surge" } }); assert.equal(n2.team[0].hp, 22);
  });
  await check("Sori decoy persists through shield moves and absorbs Royal Strike once", () => {
    const s = initial(["sori", "astra", "coddy"]); const n = g.resolveTurn(s, input(s)); assert.equal(n.decoyActive, true);
    const royal = { ...n, activeMonsterId: "astra", patternIndex: 2 }; const result = g.resolveTurn(royal, input(royal)); assert.equal(result.decoyActive, false); assert.equal(result.team[1].hp, 30);
  });
  await check("Coddy removes shield or deals direct HP damage", () => {
    const s = initial(["coddy", "astra", "giptoo"]); const n = g.resolveTurn(s, input(s, { evaluation: evaluation(0) })); assert.equal(n.kweenShield, 5); assert.equal(n.kweenHp, 100);
    s.kweenShield = 0; const n2 = g.resolveTurn(s, input(s, { evaluation: evaluation(0) })); assert.equal(n2.kweenHp, 84);
  });
  await check("all three approved two-monster synergies execute", () => {
    let s = initial(); let n = g.resolveTurn(s, input(s, { partner: "coddy" })); assert.ok(n.history[0].events.some(e => e.includes("Weakness Exploit")));
    s = initial(["giptoo", "sori", "coddy"]); s.patternIndex = 2; n = g.resolveTurn(s, input(s, { partner: "sori" })); assert.ok(n.history[0].events.some(e => e.includes("Misdirection"))); assert.equal(n.team[0].hp, 30);
    s = initial(["astra", "soli", "coddy"]); s.team[2].hp = 5; n = g.resolveTurn(s, input(s, { partner: "soli" })); assert.equal(n.team[2].hp, 20);
  });
  await check("invalid, duplicate, defeated, third-monster and wrong-owner actions are atomic", () => {
    const s = initial(); const before = structuredClone(s); const turn = input(s);
    for (const actions of [[], [...turn.output.proposedActions, ...turn.output.proposedActions], [{ monsterId: "astra", actionId: "coddy_patch_pounce" }], [{ monsterId: "unknown", actionId: "astra_galaxy_brain" }], [...turn.output.proposedActions, { monsterId: "giptoo", actionId: "giptoo_pattern_echo" }]]) {
      assert.throws(() => g.resolveTurn(s, { ...turn, output: { ...turn.output, proposedActions: actions } })); assert.deepEqual(s, before);
    }
    const dead = structuredClone(s); dead.team[0].hp = 0; assert.throws(() => g.resolveTurn(dead, turn));
  });
  await check("prompt collaboration agrees with selected and living helper", () => {
    const s = initial(); assert.equal(g.requestedPartner(s, "Astra, work with Coddy to examine the claim"), "coddy");
    assert.throws(() => g.requestedPartner(s, "Astra, work with Soli on the claim"));
    assert.throws(() => g.requestedPartner(s, "Astra, work with Coddy and Giptoo"));
    assert.throws(() => g.requestedPartner(s, "Astra, explain this claim", "coddy"));
    assert.equal(g.requestedPartner(s, "Astra, collaborate to explain this claim", "coddy"), "coddy");
    assert.throws(() => g.offlineTurn(s, "hi"));
  });
  await check("research is explicit; ordinary reasoning requests do not search", () => {
    assert.equal(g.wantsResearch("Explain the claim and use clear reasoning"), false);
    assert.equal(g.wantsResearch("Don't research this. Just explain the claim."), false);
    for (const text of ["Research this", "find reliable sources", "verify this", "look up evidence"]) assert.equal(g.wantsResearch(text), true);
  });
  await check("all 10 possible teams can complete all 3 challenges offline", () => {
    let encounters = 0;
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++) for (const scenario of KWEEN_SCENARIOS) {
      let s = g.createBattle([MONSTERS[a].id, MONSTERS[b].id, MONSTERS[c].id], scenario.id);
      for (let i = 0; i < 30 && s.status === "active"; i++) s = g.resolveTurn(s, input(s));
      assert.equal(s.status, "victory"); assert.equal(s.scenarioId, scenario.id); encounters++;
    }
    assert.equal(encounters, 30);
  });
  await check("defeated active companion automatically switches; defeat and retry work", () => {
    let s = initial(["giptoo", "astra", "coddy"]); s.patternIndex = 2; s.team[0].hp = 1;
    let turn = input(s, { evaluation: evaluation(0) }); turn.output.predictedMove = "score_surge";
    const n = g.resolveTurn(s, turn); assert.equal(n.team[0].hp, 0); assert.equal(n.activeMonsterId, "astra");
    s.team[1].hp = 0; s.team[2].hp = 0; const lost = g.resolveTurn(s, turn); assert.equal(lost.status, "defeat");
    const retry = g.createBattle(lost.team.map(m => m.id), lost.scenarioId); assert.equal(retry.status, "active"); assert.ok(retry.team.every(m => m.hp === 30));
  });
  await check("all landmarks reachable; trees, rocks, water, NPC, and bounds block movement", () => {
    for (const p of [{ x: 0, y: 5 }, { x: 16, y: 5 }, { x: 5, y: 4 }, { x: 3, y: 4 }, { x: 9, y: 4 }, m.LANDMARKS.guide]) assert.equal(m.blocked(p), true);
    const seen = new Set([m.keyOf(m.START)]); const queue = [m.START];
    while (queue.length) { const p = queue.shift(); for (const d of ["up", "left", "down", "right"]) { const next = m.facing(p, d); if (!m.blocked(next) && !seen.has(m.keyOf(next))) { seen.add(m.keyOf(next)); queue.push(next); } } }
    for (const point of Object.values(m.LANDMARKS)) assert.ok([...seen].some(key => { const [x, y] = key.split(",").map(Number); return m.distance({ x, y }, point) <= 1; }));
  });
  await check("random spawns are unique, reachable, clear of landmarks, and different each adventure", () => {
    const layouts = new Set();
    for (let seed = 1; seed <= 250; seed++) {
      let value = seed;
      const random = () => { value = (Math.imul(1664525, value) + 1013904223) >>> 0; return value / 4294967296; };
      const world = m.createExploration(random);
      assert.equal(world.collected.length, 0); assert.equal(world.wild.length, 5);
      assert.equal(new Set(world.wild.map(monster => monster.id)).size, 5);
      assert.equal(new Set(world.wild.map(monster => m.keyOf(monster.position))).size, 5);
      for (const monster of world.wild) {
        assert.equal(m.blocked(monster.position), false); assert.equal(m.isPath(monster.position), false);
        assert.ok(Object.values(m.LANDMARKS).every(p => m.distance(p, monster.position) >= 3));
        assert.ok(m.pathTo(world, monster.position, true).length > 0);
      }
      layouts.add(JSON.stringify(world.wild));
    }
    assert.ok(layouts.size > 240);
  });
  await check("collection requires a nearby encounter; removes the monster once and survives navigation", () => {
    let world = m.createExploration(() => .5);
    const monster = world.wild[0]; const original = structuredClone(world);
    assert.strictEqual(m.collectMonster(world, monster.id), world);
    const route = m.pathTo(world, monster.position, true);
    for (const next of route) {
      const p = world.player; const direction = next.x > p.x ? "right" : next.x < p.x ? "left" : next.y > p.y ? "down" : "up";
      world = m.moveExplorer(world, direction);
    }
    assert.equal(m.nearbyMonster(world)?.id, monster.id);
    const direction = monster.position.x > world.player.x ? "right" : monster.position.x < world.player.x ? "left" : monster.position.y > world.player.y ? "down" : "up";
    assert.deepEqual(m.moveExplorer(world, direction).player, world.player);
    const collected = m.collectMonster(world, monster.id);
    assert.deepEqual(collected.collected, [monster.id]); assert.equal(collected.wild.length, 4);
    assert.strictEqual(m.collectMonster(collected, monster.id), collected);
    assert.equal(original.wild.length, 5); assert.deepEqual(original.collected, []);
    assert.deepEqual(m.moveExplorer(collected, direction).player, monster.position);
  });
  await check("only collected monsters can enter a party; exactly three distinct members", () => {
    assert.throws(() => m.toggleParty([], [], "soli"));
    let selected = []; const found = ["soli", "astra", "coddy", "sori"];
    for (const id of found.slice(0, 3)) selected = m.toggleParty(selected, found, id);
    assert.equal(selected.length, 3); assert.throws(() => m.toggleParty(selected, found, "sori"));
    assert.throws(() => m.toggleParty(selected, found, "giptoo"));
    selected = m.toggleParty(selected, found, "astra"); assert.equal(selected.length, 2);
    selected = m.toggleParty(selected, found, "sori"); assert.equal(new Set(selected).size, 3);
  });

  // Test the real middleware with in-memory requests and mocked providers. Never use local keys.
  const { apiMiddleware } = await vite.ssrLoadModule("/server/api.ts");
  const savedFetch = globalThis.fetch;
  const keys = ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_JUDGE_MODEL", "CEREBRAS_API_KEY", "CEREBRAS_MODEL", "EXA_API_KEY"];
  const savedEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  let calls = []; let judgeFails = false; let malformed = false;
  const fakeOutput = { monsterResponse: "Let's check the assumption.", argument: "One benchmark measures a selected set of tasks. Broader claims need unfamiliar tasks and robustness checks.", proposedActions: [{ monsterId: "astra", actionId: "astra_galaxy_brain" }], predictedMove: null };
  const middleware = apiMiddleware();
  const baseRequest = { scenarioId: KWEEN_SCENARIOS[0].id, instruction: "Astra, explain when Kween's claim fails and give one testable limitation.", activeMonsterId: "astra", selectedMonsterIds: ["astra", "coddy", "giptoo"], requestResearch: false, battleContext: { turn: 1, kweenHp: 100, kweenShield: 20, nextBossMove: "Benchmark Brag" } };
  async function api(body = baseRequest, battleId = `test-${Math.random()}`) {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", url: "/api/battle/turn", headers: { "x-battle-id": battleId } });
    let payload; const res = { statusCode: 200, setHeader() {}, end(text) { payload = JSON.parse(text); } };
    await middleware(req, res, () => { throw new Error("Unexpected route fallthrough"); }); return { status: res.statusCode, ...payload };
  }
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, { AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model", EXA_API_KEY: "test-exa" });
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url, body });
      if (String(url).includes("exa.ai")) return new Response(JSON.stringify({ results: Array.from({ length: 5 }, (_, i) => ({ id: `source-${i}`, title: "Test research", url: `https://example.org/paper-${i}`, highlights: ["Actual test excerpt"] })) }));
      const name = body.text?.format?.name ?? body.response_format?.json_schema?.name;
      if (name === "judge_evaluation" && judgeFails) throw new Error("Simulated judge timeout");
      const data = name === "judge_evaluation" ? evaluation(80) : malformed ? { ...fakeOutput, hp: 0 } : fakeOutput;
      return new Response(JSON.stringify({ output_text: JSON.stringify(name === "judge_evaluation" && calls.some(c => String(c.url).includes("exa.ai")) ? { ...data, evidence: 80 } : data) }));
    };
    await check("live route uses separate monster and neutral judge calls, with no ordinary search", async () => {
      calls = []; const r = await api(); assert.equal(r.ok, true); assert.equal(r.mode, "live"); assert.equal(calls.length, 2); assert.deepEqual(r.researchResults, []);
      const judge = calls[1].body; assert.ok(!judge.input.includes("voiceStyle")); assert.ok(!judge.input.includes("primaryColor")); assert.ok(!("damage" in r));
    });
    await check("explicit research returns <=3 actual results and cannot search twice", async () => {
      calls = []; const id = "research-cap"; const body = { ...baseRequest, instruction: "Astra, research the limits of this benchmark claim.", requestResearch: true };
      const r = await api(body, id); assert.equal(r.researchResults.length, 3); assert.equal(calls.filter(c => String(c.url).includes("exa.ai")).length, 1);
      const again = await api(body, id); assert.match(again.researchNotice, /allowance used/); assert.equal(calls.filter(c => String(c.url).includes("exa.ai")).length, 1);
    });
    await check("research intent is detected even without the toggle", async () => { calls = []; const r = await api({ ...baseRequest, instruction: "Astra, find reliable sources about this claim." }); assert.equal(r.ok, true); assert.equal(calls.length, 3); });
    await check("four-turn cap means at most 8 model requests", async () => {
      calls = []; for (let i = 0; i < 4; i++) assert.equal((await api(baseRequest, "turn-cap")).ok, true);
      const r = await api(baseRequest, "turn-cap"); assert.equal(r.status, 429); assert.equal(calls.length, 8);
    });
    await check("malformed provider fields and incompatible helper requests are rejected", async () => {
      calls = []; malformed = true; assert.equal((await api()).ok, false); assert.equal(calls.length, 1); malformed = false;
      calls = []; assert.equal((await api({ ...baseRequest, partnerMonsterId: "coddy" })).status, 400); assert.equal(calls.length, 0);
    });
    await check("judge failure retains safe monster response and marks provisional offline scoring", async () => {
      calls = []; judgeFails = true; const r = await api(); assert.equal(r.ok, false); assert.equal(r.mode, "offline"); assert.equal(r.monsterTurn.argument, fakeOutput.argument); assert.equal(calls.length, 2); judgeFails = false;
    });
    await check("Cerebras follows the same shared monster/judge interface", async () => {
      calls = []; Object.assign(process.env, { AI_PROVIDER: "cerebras", CEREBRAS_API_KEY: "test-key", CEREBRAS_MODEL: "test-model" });
      const r = await api(); assert.equal(r.ok, true); assert.equal(calls.length, 2); assert.ok(calls.every(c => String(c.url).includes("cerebras.ai")));
    });
    await check("missing provider configuration falls back without any external request", async () => {
      calls = []; delete process.env.CEREBRAS_API_KEY; assert.equal((await api()).mode, "offline"); assert.equal(calls.length, 0);
    });
  } finally { globalThis.fetch = savedFetch; for (const k of keys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } }
  console.log(`\n${passed} checks passed (including 30 full offline encounters). No live provider calls were made.`);
} finally { await vite.close(); }
