import { useEffect, useRef, useState } from "react";
import { AbilityArt, AtlasArt, CharacterArt, MonsterArt } from "./Art";
import { arenaBackground } from "./assetManifest";
import { Header, Health, EFFECTS, ROLES, palette } from "./UI";
import { ASSETS } from "../shared/assets";
import { battleTurn, createBattleSessionId } from "../shared/api";
import { BATTLE_CONFIG as C } from "../shared/battleConfig";
import type { JudgeEvaluation, MonsterId, SelectedTeam } from "../shared/types";
import { monsterFor, MOVE_NAMES, nextMove, offlineTurn, requestedPartner, resolveTurn, scenarioFor, validEvaluation, wantsResearch, type BattleState, type TurnRecord } from "../game/battle";

export function Battle({ state, onChange, onBack, onResult }: { state: BattleState; onChange: (v: BattleState) => void; onBack: () => void; onResult: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [partner, setPartner] = useState<MonsterId | undefined>();
  const [research, setResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"turn" | "journal">("turn");
  const [battleId] = useState(createBattleSessionId);
  const sending = useRef(false);
  const alive = useRef(true);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = monsterFor(state.activeMonsterId);
  const activeHp = state.team.find(m => m.id === active.id)!.hp;
  const scenario = scenarioFor(state.scenarioId);
  const last = state.history.at(-1);
  const helpers = state.team.filter(m => m.id !== active.id && m.hp > 0);
  useEffect(() => { if (partner && !helpers.some(m => m.id === partner)) setPartner(undefined); }, [state.activeMonsterId, state.turn, partner]);

  async function submit() {
    if (sending.current || !prompt.trim() || state.status !== "active") return;
    setError("");
    let helper: MonsterId | undefined;
    try { helper = requestedPartner(state, prompt, partner); } catch (e) { setError((e as Error).message); return; }
    sending.current = true; setBusy(true);
    try {
      const requestResearch = research || wantsResearch(prompt);
      const result = state.liveTurnsUsed < C.liveTurnsPerBattle ? await battleTurn({ battleId, scenarioId: state.scenarioId, instruction: prompt.trim(), activeMonsterId: active.id, ...(helper ? { partnerMonsterId: helper } : {}), selectedMonsterIds: state.team.map(m => m.id) as SelectedTeam, requestResearch, battleContext: { turn: state.turn, kweenHp: state.kweenHp, kweenShield: state.kweenShield, nextBossMove: MOVE_NAMES[nextMove(state)] } }) : { ok: false as const, error: "Live turn allowance used. Practice continues offline." };
      if (!alive.current) return;
      let next: BattleState;
      if (result.ok && validEvaluation(result.evaluation)) {
        try { next = resolveTurn(state, { instruction: prompt.trim(), partner: helper, output: result, evaluation: result.evaluation, mode: "live", evidence: result.researchResults, researchUsed: result.researchUsed, notice: result.researchNotice }); }
        catch { const fallback = offlineTurn(state, prompt, helper); next = resolveTurn(state, { instruction: prompt.trim(), partner: helper, ...fallback, mode: "offline", notice: "The live response was invalid. This turn uses authored practice feedback." }); }
      } else {
        const fallback = offlineTurn(state, prompt, helper);
        const safeResponse = "monsterTurn" in result ? result.monsterTurn : undefined;
        const evidence = "researchResults" in result ? result.researchResults : undefined;
        const researchUsed = "researchUsed" in result ? result.researchUsed : undefined;
        const notice = `${"error" in result ? result.error : "Live judging unavailable."}${requestResearch && !evidence?.length ? " No research sources were retrieved this turn." : ""}`;
        try { next = resolveTurn(state, { instruction: prompt.trim(), partner: helper, output: safeResponse ?? fallback.output, evaluation: fallback.evaluation, mode: "offline", evidence, researchUsed, notice }); }
        catch { next = resolveTurn(state, { instruction: prompt.trim(), partner: helper, ...fallback, mode: "offline", researchUsed, notice: "Live output was invalid. An authored example and provisional practice score were used." }); }
      }
      onChange(next); setPrompt(""); setResearch(false); setPartner(undefined); setTab("turn");
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "That instruction couldn't be used. Try a clear task about the claim."); }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  return <><Header screen="battle"><span className={`mode-badge mode-${state.mode}`}><span />{state.mode === "live" ? "Live AI" : "Offline Practice Mode"}</span><button className="text-button leave-battle" disabled={busy} onClick={onBack}>Change party ↗</button></Header><main className="battle-page page-width"><div className="battle-heading"><div><p className="eyebrow">THE BENCHMARK MONARCH</p><h1>A royal reality check.</h1></div><div className="turn-indicator"><span className={busy ? "thinking-dot" : "status-dot"} />{state.status === "victory" ? "VICTORY" : state.status === "defeat" ? "TEAM DEFEATED" : busy ? `${active.name.toUpperCase()} IS THINKING…` : `YOUR TURN · ${state.turn}`}</div></div>
    <section className={`arena ${busy ? "arena-busy" : ""}`} style={{ backgroundImage: `url("${arenaBackground()}")` }} aria-label="Kween's battle arena"><div className="arena-shade" /><div className="kween-claim"><span>♛ KWEEN DECLARES</span><p>“{scenario.claim}”</p></div><div className="boss-status"><div><strong>Kween</strong><span>BENCHMARK MONARCH</span></div><div className="vital-line"><span>HP</span><Health value={state.kweenHp} max={100} label="Kween HP" /><b>{state.kweenHp}<small>/100</small></b></div><div className="vital-line shield-vital"><span>SH</span><Health value={state.kweenShield} max={20} shield label="Kween shield" /><b>{state.kweenShield}<small>/20</small></b></div></div>
      <div key={`kween-${state.turn}`} className={`arena-kween ${last ? "has-been-hit" : ""}`}><CharacterArt id="kween" src={ASSETS.kween} label="Kween, the royal fox-cat" />{last && <span className="impact-number">−{last.impact}</span>}</div>
      <div key={`active-${active.id}-${state.turn}`} className="arena-active" style={palette(active.id)}><MonsterArt monster={active} />{busy && <span className="thinking-bubble">•••</span>}</div>
      {state.decoyActive && <div className="arena-decoy"><AtlasArt id="decoy" /><span>DECOY READY</span></div>}
      <div className="ally-status"><div><strong>{active.name}</strong><span>{ROLES[active.id]}</span></div><div className="vital-line"><span>HP</span><Health value={activeHp} label={`${active.name} HP`} /><b>{activeHp}<small>/30</small></b></div></div>
      <div className="arena-next"><span>♛ UP NEXT</span><strong>{MOVE_NAMES[nextMove(state)]}</strong><small>{nextMove(state) === "royal_strike" ? "8 damage to your active companion" : "+5 shield · up to 20"}</small></div>
      {state.status !== "active" && <div className="arena-outcome"><span>{state.status === "victory" ? "✦" : "♡"}</span><h2>{state.status === "victory" ? "A good point, well made!" : "A lesson for next time."}</h2><button className="button button-coral" onClick={onResult}>{state.status === "victory" ? "Collect your badge →" : "See results →"}</button></div>}
    </section>
    <div className="battle-dock"><section className="battle-party"><div className="section-label"><span>YOUR TEAM</span><span>CHOOSE WHO LEADS</span></div>{state.team.map(member => { const m = monsterFor(member.id); return <button className={`battle-party-member ${m.id === active.id ? "is-active" : ""}`} style={palette(m.id)} disabled={busy || member.hp <= 0 || state.status !== "active"} key={m.id} onClick={() => { onChange({ ...state, activeMonsterId: m.id }); setPartner(undefined); setError(""); }} aria-pressed={m.id === active.id}><MonsterArt monster={m} /><div><strong>{m.name} <small>{m.id === active.id ? "IN BATTLE" : member.hp <= 0 ? "RESTING" : "READY"}</small></strong><Health value={member.hp} label={`${m.name} party HP`} /><span>{m.abilityName}</span></div><b>{member.hp}<small>/30</small></b></button>; })}</section>
    <section className="command-panel"><div className="command-heading"><div><p className="eyebrow">WHAT'S THE MOVE?</p><h2>What should {active.name} investigate?</h2></div><div className="command-ability"><AbilityArt monster={active} /><span>{active.abilityName}</span></div></div><label className="sr-only" htmlFor="battle-prompt">Instruction for {active.name}</label><textarea id="battle-prompt" ref={promptRef} maxLength={3000} value={prompt} disabled={busy || state.status !== "active"} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void submit(); } }} placeholder={`${active.name}, examine Kween's claim. What assumption does it make, and how could we test it?`} />
      <div className="command-tools"><details><summary>✦ Team up & research{partner ? ` · ${monsterFor(partner).name}` : ""}</summary><div className="optional-tools"><div className="helper-options"><span>TEAM HELPER</span><button aria-pressed={!partner} disabled={busy} onClick={() => setPartner(undefined)}>Solo</button>{helpers.map(m => <button key={m.id} aria-pressed={partner === m.id} disabled={busy} onClick={() => setPartner(m.id)}>{monsterFor(m.id).name}</button>)}</div>{partner && <p>Ask {monsterFor(partner).name} to help in your instruction. {EFFECTS[partner]}</p>}<label className="research-option"><input type="checkbox" checked={research} disabled={busy || state.researchUsed} onChange={e => setResearch(e.target.checked)} /><span>{state.researchUsed ? "Research allowance used for this battle" : "Request research with Exa · one search per battle"}</span></label></div></details><button className="prompt-inspiration" disabled={busy} onClick={() => { setPrompt(`${active.name}, explain when Kween's claim could be true and where it fails. Give one testable counterexample.${partner ? ` Work with ${monsterFor(partner).name}.` : ""}`); promptRef.current?.focus(); }}>Need a starting idea? ↗</button></div>
      {error && <p className="turn-error" role="alert">{error}</p>}<div className="command-footer"><span>{prompt.length}/3000 <span>· Ctrl / ⌘ + Enter</span></span><button className="button button-dark" disabled={busy || !prompt.trim() || state.status !== "active"} onClick={() => void submit()}>{busy ? "Thinking…" : `${active.name}, go!`} <span>→</span></button></div>
    </section></div>
    <section className="battle-feedback" aria-live="polite"><div className="feedback-tabs"><button aria-pressed={tab === "turn"} onClick={() => setTab("turn")}>Latest turn {last ? `· ${last.turn}` : ""}</button><button aria-pressed={tab === "journal"} onClick={() => setTab("journal")}>Battle journal <span>{state.history.length}</span></button><span className="feedback-mode">{state.mode === "offline" ? "Authored responses · provisional heuristic feedback" : "Monster response + separate neutral judge"}</span></div>{tab === "turn" ? last ? <TurnFeedback key={last.turn} record={last} /> : <div className="battle-welcome"><AtlasArt id="sparkle" /><div><h3>Big claim. Small monster. Your move.</h3><p>Choose your companion, read Kween's claim, and give one clear instruction. Your argument deals damage; your monster's ability adds its own effect.</p><small>Offline Practice Mode uses authored examples and a simple prompt heuristic. It does not assess whether your reasoning is correct. Live AI judging and research require server configuration.</small></div></div> : <div className="journal">{state.history.length ? [...state.history].reverse().map(record => <details key={record.turn}><summary><span>TURN {record.turn} · {monsterFor(record.activeId).name}</span><strong>{Math.round(record.score)} / 100</strong><span>{record.impact} IMPACT</span></summary><TurnFeedback record={record} /></details>) : <p>Your adventure is waiting for its first move.</p>}</div>}</section>
  </main></>;
}

function TurnFeedback({ record }: { record: TurnRecord }) {
  const [scoresOpen, setScoresOpen] = useState(false);
  const e = record.evaluation;
  return <div className="turn-feedback"><div className="turn-response"><div className="turn-response-heading"><MonsterArt monster={monsterFor(record.activeId)} /><div><span className="eyebrow">{record.mode === "offline" ? "AUTHORED PRACTICE EXAMPLE" : "YOUR MONSTER RESPONDS"}</span><h3>{record.output.monsterResponse}</h3></div></div><p>{record.output.argument}</p><details className="original-prompt"><summary>Your instruction ↗</summary><blockquote>{record.prompt}</blockquote></details><div className="turn-events">{record.events.map((event, i) => <p key={i}>{event}</p>)}</div>{record.notice && <p className="service-note">{record.notice}</p>}{record.evidence.length > 0 && <div className="evidence-list"><span className="section-label">RESEARCH SOURCES</span>{record.evidence.slice(0, 3).filter(r => /^https?:\/\//i.test(r.url)).map(r => <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"><strong>{r.title} ↗</strong><span>{r.domain}{r.publishedDate ? ` · ${r.publishedDate.slice(0, 10)}` : ""}</span>{r.excerpt && <p>{r.excerpt}</p>}</a>)}</div>}</div><aside className="judge-feedback"><div className="judge-score"><span>{record.mode === "offline" ? "PRACTICE SCORE" : "NEUTRAL JUDGE"}</span><strong>{Math.round(record.score)}<small>/100</small></strong><b>{record.impact} IMPACT</b></div><div className="judge-tip"><span>✦ WHAT WORKED</span><p>{e.strength}</p></div><div className="judge-tip improvement"><span>↗ TRY NEXT TIME</span><p>{e.improvementTip}</p></div><button className="text-button rubric-toggle" onClick={() => setScoresOpen(!scoresOpen)} aria-expanded={scoresOpen}>{scoresOpen ? "Hide rubric −" : "See rubric +"}</button>{scoresOpen && <dl className="rubric-scores">{(["relevance", "reasoning", "counterargument", "evidence", "clarity", "promptQuality"] as (keyof JudgeEvaluation)[]).map(key => <div key={key}><dt>{key === "promptQuality" ? "Prompt quality" : key}</dt><dd>{e[key] ?? "N/A"}</dd></div>)}</dl>}</aside></div>;
}
