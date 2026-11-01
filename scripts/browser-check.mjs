import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Uses installed Chrome and its native DevTools protocol. No browser or test dependencies.
const origin = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const chromePath = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(join(tmpdir(), "prompt-monsters-qa-"));
const output = "artifacts/qa";
await mkdir(output, { recursive: true });
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome did not start within 15s")), 15000);
    chrome.on("error", reject);
    chrome.stderr.on("data", data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    chrome.on("exit", code => reject(new Error(`Chrome exited with code ${code}`)));
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let messageId = 0; const pending = new Map(); const handlers = [];
  socket.addEventListener("message", ({ data }) => {
    const msg = JSON.parse(String(data));
    if (msg.id) { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } }
    else for (const fn of handlers) fn(msg);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++messageId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  const pageErrors = []; const badAssets = [];
  handlers.push(msg => {
    if (msg.method === "Runtime.exceptionThrown") pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400 && msg.params.response.url.includes("/assets/")) badAssets.push(msg.params.response.url);
    if (msg.method === "Fetch.requestPaused") void cdp("Fetch.fulfillRequest", { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ ok: false, mode: "offline", error: "Browser test: live services bypassed." })).toString("base64") });
  });
  await cdp("Runtime.enable"); await cdp("Page.enable"); await cdp("Network.enable");
  // Never spend API credits or send prompts to providers during automated browser QA.
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*/api/battle/turn", requestStage: "Request" }] });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  async function until(expression, label) { for (let i = 0; i < 100; i++) { if (await evaluate(`!!(${expression})`)) return; await new Promise(r => setTimeout(r, 80)); } throw new Error(`Timed out: ${label}`); }
  async function click(text, selector = "button") { await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('Missing control: ' + ${JSON.stringify(text)}); if (el.disabled) throw new Error('Disabled control: ' + ${JSON.stringify(text)}); el.click(); })()`); }
  async function fill(text) { await evaluate(`(() => { const t = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', {bubbles:true})); })()`); }
  async function key(key, code = key) { await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code }); }
  async function screenshot(name) { await evaluate("document.fonts.ready.then(() => new Promise(r => setTimeout(r, 150)))"); const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(`${output}/${name}.png`, Buffer.from(data, "base64")); }
  const overflow = () => evaluate("document.documentElement.scrollWidth > innerWidth + 1");
  const visiblePlayer = () => evaluate(`(() => {
    const p = document.querySelector('.world-player > .character-art').getBoundingClientRect();
    const scene = document.querySelector('.world-scene').getBoundingClientRect();
    const board = document.querySelector('.world-board').getBoundingClientRect();
    return p.width > 0 && p.height > 0 && p.top >= scene.top - 1 && p.bottom <= scene.bottom + 1 && p.left >= scene.left - 1 && p.right <= scene.right + 1
      && p.top >= 0 && p.bottom <= innerHeight && board.width <= scene.width + 1 && board.height <= scene.height + 1
      && Number(getComputedStyle(document.querySelector('.world-player')).zIndex) > Number(getComputedStyle(document.querySelector('.world-tree')).zIndex);
  })()`);

  await cdp("Page.navigate", { url: origin });
  await until("document.querySelector('.title-stage')", "title screen");
  await evaluate("Promise.all([...document.images].map(i => i.decode().catch(() => {})))");
  await screenshot("01-title-desktop"); assert.equal(await overflow(), false);
  await click("Start your adventure"); await until("document.querySelector('.world-player')", "meadow");
  assert.equal(await evaluate("document.querySelectorAll('.world-creature').length"), 5);
  const firstLayout = await evaluate("[...document.querySelectorAll('.world-creature')].map(m => [m.dataset.monsterId,m.dataset.position])");
  assert.equal(await visiblePlayer(), true);
  assert.equal(await evaluate("document.querySelector('.world-player').dataset.position"), "2,8");
  await key("ArrowLeft"); await until("document.querySelector('.world-player').dataset.position === '1,8'", "first movement");
  await key("ArrowLeft"); assert.equal(await evaluate("document.querySelector('.world-player').dataset.position"), "1,8");
  for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowUp"]) await key(k);
  await until("document.querySelector('.world-player').dataset.position === '4,7'", "guide approach");
  await key("e", "KeyE"); await until("document.querySelector('.dialogue-active')", "NPC dialogue");
  for (let i = 0; i < 4; i++) await key("e", "KeyE");
  await until("!document.querySelector('.dialogue-active')", "guide dialogue completion");
  await screenshot("02-meadow-desktop");
  // An empty collection cannot skip exploration, even if a roster card is clicked.
  await click("My party"); await until("document.querySelector('.roster')", "empty collection");
  assert.equal(await evaluate("document.querySelectorAll('.roster-card[data-collected=false]').length"), 5);
  await evaluate("document.querySelector('.roster-card[aria-label^=\"Astra,\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.roster-card.is-selected').length"), 0);
  await click("Back to meadow");
  // Declining an encounter leaves the monster on the map, ready to be found again.
  await evaluate("document.querySelector('.world-creature').click()");
  await until("document.querySelector('.encounter-dialog[open]')", "random monster approach");
  await key("Escape"); await until("!document.querySelector('.encounter-dialog')", "declined encounter closes");
  assert.equal(await evaluate("document.querySelectorAll('.world-creature').length"), 5);
  for (const [index, name] of ["Astra", "Coddy", "Soli", "Giptoo", "Sori"].entries()) {
    await click(name, ".world-creature");
    await until(`document.querySelector('.encounter-dialog[open] h2')?.textContent.includes(${JSON.stringify(name)})`, `${name} encounter`);
    if (index === 0) await screenshot("11-random-encounter-desktop");
    await click(`Collect ${name}`);
    await until(`document.querySelector('.encounter-dialog h2')?.textContent.includes('joined your collection') && document.querySelectorAll('.world-creature').length === ${4 - index}`, `${name} collected`);
    await click("Keep exploring");
    await until("!document.querySelector('.encounter-dialog')", "return to map");
    assert.equal(await visiblePlayer(), true);
  }
  assert.ok(await evaluate("document.querySelector('.discovery-counter').textContent.includes('5 / 5')"));
  await click("My party"); await until("document.querySelector('.roster')", "collection");
  assert.equal(await evaluate("document.querySelectorAll('.roster-card').length"), 5);
  assert.equal(await evaluate("document.querySelectorAll('.roster-card[data-collected=true]').length"), 5);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Choose 3 more')).disabled"), true);
  for (const name of ["Astra", "Coddy", "Soli"]) await evaluate(`document.querySelector('.roster-card[aria-label^="${name},"]').click()`);
  await until("document.querySelectorAll('.roster-card.is-selected').length === 3", "exactly three selected");
  await evaluate("document.querySelector('.roster-card[aria-label^=\"Giptoo,\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.roster-card.is-selected').length"), 3);
  await screenshot("03-party-desktop"); assert.equal(await overflow(), false);
  await click("Challenge Kween"); await until("document.querySelector('.arena')", "battle");
  await screenshot("04-battle-desktop");
  await fill("hi"); await click("Astra, go!"); await until("document.querySelector('[role=alert]')", "invalid prompt hint");
  assert.ok(await evaluate("document.querySelector('.turn-indicator').textContent.includes('1')"));
  await click("Team up & research", "summary"); await click("Coddy", ".helper-options button");
  await fill("Astra, explain when Kween's claim fails and give one testable counterexample."); await click("Astra, go!");
  await until("document.querySelector('[role=alert]')?.textContent.includes('Coddy')", "helper mismatch validation");
  await fill("Astra, explain when Kween's claim fails and give one testable counterexample. Work with Coddy."); await click("Astra, go!");
  await until("document.querySelector('.turn-events')?.textContent.includes('Weakness Exploit')", "combo feedback");
  assert.ok(await evaluate("document.querySelector('.mode-badge').textContent.includes('Offline Practice Mode')"));
  await click("See rubric"); await until("document.querySelector('.rubric-scores')", "rubric disclosure");
  await screenshot("05-battle-feedback-desktop");
  for (let i = 0; i < 12; i++) {
    if (await evaluate("!!document.querySelector('.arena-outcome')")) break;
    await fill("Astra, explain when Kween's claim could be true and where it fails. Give one testable counterexample.");
    const turnBefore = await evaluate("document.querySelector('.turn-indicator').textContent");
    await click("Astra, go!");
    await until(`document.querySelector('.turn-indicator').textContent !== ${JSON.stringify(turnBefore)} && !document.querySelector('.arena-busy')`, "next battle turn");
  }
  await until("document.querySelector('.arena-outcome')", "battle victory");
  await click("Collect your badge"); await until("document.querySelector('.earned-badge')", "victory screen");
  await screenshot("06-victory-desktop");
  await click("Another round?"); await until("document.querySelector('.turn-indicator')?.textContent.includes('1')", "retry resets battle");
  await click("Change party"); await click("Back to meadow");
  assert.equal(await evaluate("document.querySelectorAll('.world-creature').length"), 0);
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [320, 568]]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await evaluate("window.scrollTo(0,0)");
    await until("document.querySelector('.world-board').getBoundingClientRect().width <= document.querySelector('.world-scene').getBoundingClientRect().width + 1", "map fits resized viewport");
    assert.equal(await overflow(), false, `no horizontal overflow at ${width}x${height}`);
    assert.equal(await visiblePlayer(), true, `player visible above scenery at ${width}x${height}`);
    assert.ok(await evaluate("document.querySelector('.world-bottomline').getBoundingClientRect().bottom <= innerHeight"), `map controls visible at ${width}x${height}`);
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot("07-meadow-mobile"); assert.equal(await overflow(), false);
  await click("My party"); await screenshot("08-party-mobile"); assert.equal(await overflow(), false);
  await click("Challenge Kween"); await screenshot("09-battle-mobile"); assert.equal(await overflow(), false);
  await cdp("Page.navigate", { url: origin }); await until("document.querySelector('.title-stage')", "mobile title");
  await screenshot("10-title-mobile"); assert.equal(await overflow(), false);
  await click("Start your adventure"); await until("document.querySelector('.world-creature')", "new random adventure");
  const secondLayout = await evaluate("[...document.querySelectorAll('.world-creature')].map(m => [m.dataset.monsterId,m.dataset.position])");
  assert.notDeepEqual(firstLayout, secondLayout);
  assert.ok(await evaluate("document.querySelector('.discovery-counter').textContent.includes('0 / 5')"));
  assert.deepEqual(pageErrors, []); assert.deepEqual(badAssets, []);
  console.log("PASS browser journey: random map spawns, decline/collect encounters, collection-gated team selection, click-to-walk, collision, NPC, combat, victory, retry, new-adventure reset. Player, map and controls stay visible at 1440x900, 1280x720, 390x844 and 320x568. No page errors or missing assets. No live API calls.");
  console.log(`Screenshots: ${output}/`);
} finally { socket?.close(); chrome.kill("SIGTERM"); }
