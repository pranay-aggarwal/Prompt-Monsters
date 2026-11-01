import { useState } from "react";
import { APP_SCREENS, type AppScreen } from "./shared/navigation";
import { MONSTERS } from "./shared/monsters";

const modulePlaceholders: Record<AppScreen, string> = {
  title: "Module 1 will complete the opening title screen and start action.",
  meadow: "Module 1 will add Prompt Meadow exploration, movement, collision, and NPC interaction.",
  collection: "Module 2 will add the monster collection and exact three-monster team selection.",
  battle: "Module 3 will add the deterministic Kween battle and local prompt evaluator.",
  result: "Module 3 will add victory, defeat, retry, and result flow.",
};

export function App() {
  const [screen, setScreen] = useState<AppScreen>("title");

  return (
    <main className="min-h-screen bg-emerald-950 text-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-emerald-700 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">Prompt Monsters</p>
            <h1 className="font-display text-4xl font-black text-white">They have billions of parameters.</h1>
            <p className="mt-2 text-lg text-emerald-100">You have one good prompt.</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="MVP screens">
            {APP_SCREENS.map((item) => (
              <button
                key={item}
                className={`rounded border px-3 py-2 text-sm font-semibold capitalize transition ${
                  screen === item
                    ? "border-amber-300 bg-amber-300 text-emerald-950"
                    : "border-emerald-500 bg-emerald-900 text-emerald-50 hover:border-emerald-200"
                }`}
                type="button"
                onClick={() => setScreen(item)}
              >
                {item}
              </button>
            ))}
          </nav>
        </header>

        <section className="grid flex-1 gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="rounded border border-emerald-700 bg-emerald-900 p-6 shadow-2xl shadow-emerald-950/40">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-cyan-200">Current screen contract</p>
            <h2 className="mb-4 text-3xl font-bold capitalize text-white">{screen}</h2>
            <p className="max-w-2xl text-lg leading-8 text-emerald-50">{modulePlaceholders[screen]}</p>
          </div>

          <aside className="rounded border border-emerald-700 bg-slate-950/60 p-5">
            <h2 className="text-lg font-bold text-white">Shared Monster Data</h2>
            <p className="mt-2 text-sm text-slate-300">Canonical IDs are available for later modules from one source.</p>
            <ul className="mt-4 space-y-3">
              {MONSTERS.map((monster) => (
                <li key={monster.id} className="border-l-4 pl-3" style={{ borderColor: monster.primaryColor }}>
                  <p className="font-bold text-white">{monster.name}</p>
                  <p className="text-sm text-slate-300">{monster.abilityName}</p>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
