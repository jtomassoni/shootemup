"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayField } from "@/components/PlayField";
import { AVATARS, DESTINATIONS, GAME_TAGLINE, GAME_TITLE, levelCoat, type Avatar } from "@/game/content";
import { dailySeed, denverDay } from "@/game/daily";
import { validateName } from "@/game/names";
import { bestKey, defaultSave, destinationGate, orderedDestinations, practiceReady, sanitizeSave, SAVE_KEY, type Save } from "@/game/progress";
import { formatScore } from "@/game/score";
import { createRun } from "@/game/sim";
import type { Bucket, RunState } from "@/game/types";

type Screen = "map" | "prep" | "play" | "board";

function Bust({ avatar }: { avatar: Avatar }) {
  const ink = "#1c3144";
  return (
    <svg className="bust" viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="24" cy="45" rx="12" ry="3" fill="rgba(28,49,68,0.14)" />
      <rect x="11" y="27" width="26" height="15" rx="8" fill={avatar.shirt} stroke={ink} strokeWidth="2" />
      {avatar.prop === "apron" && (
        <rect x="18" y="30" width="12" height="11" rx="2.5" fill="#f4e6c8" stroke={ink} strokeWidth="1.5" />
      )}
      <circle cx="24" cy="18" r="9" fill={avatar.skin} stroke={ink} strokeWidth="2" />
      <Hat avatar={avatar} />
      <circle cx="20.5" cy="18.2" r="1.25" fill={ink} />
      <circle cx="27.5" cy="18.2" r="1.25" fill={ink} />
      {avatar.prop === "glasses" && (
        <g fill="none" stroke={avatar.accent} strokeWidth="1.7">
          <rect x="14.2" y="15.2" width="7.6" height="5.2" rx="1.2" />
          <rect x="26.2" y="15.2" width="7.6" height="5.2" rx="1.2" />
          <path d="M21.8 17.6h4.4" />
        </g>
      )}
    </svg>
  );
}

function Hat({ avatar }: { avatar: Avatar }) {
  const ink = "#1c3144";
  if (avatar.prop === "cap") {
    return <ellipse cx="24" cy="11" rx="11" ry="3.2" fill="#f7f3ea" stroke={ink} strokeWidth="1.8" />;
  }
  if (avatar.prop === "helmet" || avatar.prop === "bike") {
    return <path d="M14 17.5C14.4 9 18 6 24 6s9.6 3 10 11.5" fill={avatar.accent} stroke={ink} strokeWidth="1.7" />;
  }
  if (avatar.prop === "conductor") {
    return (
      <g>
        <rect x="16" y="6.5" width="16" height="5" rx="1.4" fill="#1d3557" stroke={ink} strokeWidth="1.4" />
        <ellipse cx="24" cy="11.5" rx="12" ry="2.5" fill="#1d3557" stroke={ink} strokeWidth="1.4" />
      </g>
    );
  }
  if (avatar.prop === "toque") {
    return <path d="M17 13.5C17 6 20 3.5 24 3.5S31 6 31 13.5" fill="#f7f3ea" stroke={ink} strokeWidth="1.7" />;
  }
  if (avatar.prop === "pilot") {
    return (
      <g>
        <path d="M15 14c.8-6.5 4.2-9.5 9-9.5s8.2 3 9 9.5" fill="#1d3557" stroke={ink} strokeWidth="1.5" />
        <path d="M27 13.2h10.5l-2.2 3.2H27z" fill="#1d3557" stroke={ink} strokeWidth="1.3" />
      </g>
    );
  }
  if (avatar.prop === "ranger") {
    return <ellipse cx="24" cy="11" rx="14" ry="2.8" fill="#606c38" stroke={ink} strokeWidth="1.5" />;
  }
  if (avatar.prop === "beanie") {
    return <path d="M14.5 16C15 8 18.5 4.5 24 4.5S33 8 33.5 16" fill="#1d3557" stroke={ink} strokeWidth="1.6" />;
  }
  return null;
}

export function Shell() {
  const [save, setSave] = useState<Save>(defaultSave);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("map");
  const [destination, setDestination] = useState("colorado");
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<RunState | null>(null);
  const [offerPractice, setOfferPractice] = useState(false);
  const [runId, setRunId] = useState(0);
  const runRef = useRef<RunState | null>(null);
  const recorded = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) setSave(sanitizeSave(JSON.parse(raw)));
    } catch {
      setSave(defaultSave());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [save, ready]);

  const finish = useCallback((state: RunState) => {
    setResult(state);
    setPaused(false);
    if (recorded.current === runId) return;
    recorded.current = runId;
    if (state.practice) return;
    const streak = state.status === "lost" ? (save.lossStreak[state.destination] ?? 0) + 1 : 0;
    setOfferPractice(state.status === "lost" && streak >= 3);
    setSave((prev) => {
      const next: Save = {
        ...prev,
        cleared: [...prev.cleared],
        lossStreak: { ...prev.lossStreak },
        bests: { ...prev.bests },
      };
      const key = bestKey(state.destination, state.format, state.daily ? "daily" : "free");
      if (state.score > (next.bests[key] ?? -1)) next.bests[key] = Math.floor(state.score);
      if (state.status === "won") {
        if (!next.cleared.includes(state.destination)) next.cleared.push(state.destination);
        next.lossStreak[state.destination] = 0;
      } else {
        next.lossStreak[state.destination] = (next.lossStreak[state.destination] ?? 0) + 1;
      }
      return next;
    });
  }, [runId, save.lossStreak]);

  function begin(practice: boolean, daily: boolean) {
    const day = denverDay();
    const coach = save.runs < 2 && !daily && !practice;
    const coat = levelCoat(destination);
    runRef.current = createRun({
      seed: daily ? dailySeed(day, destination) : Math.floor(Math.random() * 1_000_000_000),
      destination,
      format: coat.format,
      practice,
      coach,
      daily,
      day,
    });
    setSave((prev) => ({ ...prev, runs: prev.runs + 1 }));
    setResult(null);
    setOfferPractice(false);
    setPaused(false);
    setRunId((value) => value + 1);
    setScreen("play");
  }

  const avatar = AVATARS.find((item) => item.id === save.avatarId) ?? AVATARS[0]!;
  const place = DESTINATIONS.find((item) => item.id === destination) ?? DESTINATIONS[0]!;
  const route = orderedDestinations().map((stop, index) => ({
    stop,
    index,
    gate: destinationGate(stop.id, save),
    best: save.bests[bestKey(stop.id, levelCoat(stop.id).format, "free")],
  }));
  const featureId =
    route.find((item) => item.gate.open && !save.cleared.includes(item.stop.id))?.stop.id ??
    [...route].reverse().find((item) => item.gate.open)?.stop.id;

  return (
    <main className="phone">
      <div className="rotate">Turn the phone upright. The lane is a portrait.</div>
      {screen === "map" && (
        <section className="screen">
          <div className="scroll">
          <header className="mast">
            <p className="eyebrow">A short lane shooter</p>
            <h1>{GAME_TITLE}</h1>
            <p>{GAME_TAGLINE}</p>
          </header>
          <ol className="route">
            {route.map(({ stop, index, gate, best }) =>
              stop.id === featureId ? (
                <li key={stop.id}>
                  <button
                    className="ticket"
                    style={{ background: `linear-gradient(180deg, ${stop.sky[0]} 0%, ${stop.sky[1]} 58%, #fff 100%)` }}
                    onClick={() => {
                      setDestination(stop.id);
                      setScreen("prep");
                    }}
                  >
                    <span className="ticket-bar" style={{ background: stop.accent }} aria-hidden="true" />
                    <span className="watermark" aria-hidden="true">{index + 1}</span>
                    <span className="ticket-top">
                      <em>{stop.region}</em>
                      {best != null && <span className="stamp">Best {formatScore(best)}</span>}
                    </span>
                    <strong>{stop.name}</strong>
                    <small>{stop.blurb}</small>
                    <span className="ticket-go">Choose who holds it</span>
                  </button>
                </li>
              ) : (
                <li key={stop.id}>
                  <button
                    className={`stop ${gate.tone}`}
                    disabled={!gate.open}
                    onClick={() => {
                      setDestination(stop.id);
                      setScreen("prep");
                    }}
                  >
                    <span className="mile">{index + 1}</span>
                    <span>
                      <strong>{stop.name}</strong>
                      <em>{stop.region}</em>
                      <small>{gate.open ? stop.blurb : gate.reason}</small>
                      {best != null && <small className="best">Best {formatScore(best)}</small>}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ol>
          <details className="playtest">
            <summary>Playtest switches</summary>
            {/* iOS Chrome stamps __gCrUniqueID onto inputs before hydration. */}
            <label>
              <input
                type="checkbox"
                checked={save.unlockAll}
                suppressHydrationWarning
                onChange={(event) => setSave((prev) => ({ ...prev, unlockAll: event.target.checked }))}
              />
              Unlock Colorado and Maryland without clearing
            </label>
            <label>
              <input
                type="checkbox"
                checked={save.holdTravel}
                suppressHydrationWarning
                onChange={(event) => setSave((prev) => ({ ...prev, holdTravel: event.target.checked }))}
              />
              Hold Paris and Amsterdam the way a paid stop would
            </label>
            <label>
              <input
                type="checkbox"
                checked={save.showHitboxes}
                suppressHydrationWarning
                onChange={(event) => setSave((prev) => ({ ...prev, showHitboxes: event.target.checked }))}
              />
              Show hitboxes
            </label>
            <p>Nothing here charges anyone. The hold is only to feel the lock.</p>
          </details>
          </div>
          <div className="dock utility">
            <button className="ghost" onClick={() => setScreen("board")}>Leaderboard</button>
            <button className="ghost" onClick={() => setSave((prev) => ({ ...prev, muted: !prev.muted }))}>
              {save.muted ? "Sound off" : "Sound on"}
            </button>
          </div>
        </section>
      )}

      {screen === "prep" && (
        <section className="screen">
          <div className="scroll">
          <button className="back" onClick={() => setScreen("map")}>All stops</button>
          <header className="mast place-mast" style={{ borderBottomColor: place.accent }}>
            <p className="eyebrow">{place.region}</p>
            <h1>{place.name}</h1>
            <p>{place.blurb}</p>
          </header>
          <fieldset>
            <legend>Who is holding the lane</legend>
            <div className="cast">
              {AVATARS.map((item) => {
                const selected = save.avatarId === item.id;
                return (
                  <button
                    key={item.id}
                    className={selected ? "cast-card on" : "cast-card"}
                    aria-pressed={selected}
                    onClick={() => setSave((prev) => ({ ...prev, avatarId: item.id }))}
                  >
                    <Bust avatar={item} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.blurb}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          </div>
          <div className="dock">
            <button className="primary" onClick={() => begin(false, false)}>Play {place.name}</button>
            <button className="secondary" onClick={() => begin(false, true)}>Today&apos;s lane</button>
            {practiceReady(place.id, save) && (
              <button className="ghost" onClick={() => begin(true, false)}>Practice this stop</button>
            )}
            <p className="fine">Today&apos;s lane uses the same crowd for everyone. It does not pay you for showing up.</p>
          </div>
        </section>
      )}

      {screen === "board" && (
        <Board
          destination={destination}
          onDestination={setDestination}
          onBack={() => setScreen("map")}
        />
      )}

      {screen === "play" && runRef.current && (
        <>
          <PlayField
            run={runRef.current}
            runId={runId}
            avatar={avatar}
            muted={save.muted}
            music={save.music}
            showHitboxes={save.showHitboxes}
            paused={paused || result != null}
            onDone={finish}
            onPause={() => setPaused((value) => !value)}
          />
          <div className="corner">
            <button onClick={() => setSave((prev) => ({ ...prev, muted: !prev.muted }))}>{save.muted ? "Muted" : "Mute"}</button>
            <button onClick={() => setPaused((value) => !value)}>{paused ? "Resume" : "Pause"}</button>
          </div>
          {paused && !result && (
            <div className="sheet">
              <h2>Paused</h2>
              <p>Arrows or A and D aim. On a phone, drag the lower half.</p>
              <button className="primary" onClick={() => setPaused(false)}>Resume</button>
              <button
                className="ghost"
                onClick={() => setSave((prev) => ({ ...prev, music: !prev.music }))}
              >
                {save.music ? "Music on" : "Music off"}
              </button>
              <button className="ghost" onClick={() => setScreen("prep")}>Quit run</button>
            </div>
          )}
          {result && (
            <Results
              state={result}
              save={save}
              setSave={setSave}
              offerPractice={offerPractice}
              onRetry={() => begin(result.practice, result.daily)}
              onPractice={() => begin(true, false)}
              onMap={() => setScreen("map")}
            />
          )}
        </>
      )}
    </main>
  );
}

function Results({
  state,
  save,
  setSave,
  offerPractice,
  onRetry,
  onPractice,
  onMap,
}: {
  state: RunState;
  save: Save;
  setSave: (update: Save | ((prev: Save) => Save)) => void;
  offerPractice: boolean;
  onRetry: () => void;
  onPractice: () => void;
  onMap: () => void;
}) {
  const [name, setName] = useState(save.gamertag);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState("");
  const [sending, setSending] = useState(false);
  const next = DESTINATIONS[DESTINATIONS.findIndex((item) => item.id === state.destination) + 1];
  const line = state.status === "won" ? state.winReason : state.lossReason;

  async function post() {
    const problem = validateName(name);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gamertag: name,
          secret: save.secret || undefined,
          destination: state.destination,
          format: state.format,
          bucket: state.daily ? "daily" : "free",
          day: state.day,
          score: Math.floor(state.score),
          hearts: state.hearts,
          chain: state.parts.bestChain,
        }),
      });
      const payload = (await response.json()) as { error?: string; secret?: string | null; rank?: number };
      if (!response.ok) {
        setError(payload.error || "The board did not take that score.");
        return;
      }
      setSave((prev) => ({ ...prev, gamertag: name.trim(), secret: payload.secret || prev.secret }));
      setPosted(payload.rank ? `Posted. Rank ${payload.rank}.` : "Posted.");
    } catch {
      setError("The board did not answer. The score is still on this phone.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sheet">
      <p className="eyebrow">{state.status === "won" ? "Lane held" : "Lane lost"}</p>
      <h2>{formatScore(state.score)}</h2>
      <p>{line}</p>
      {state.status === "won" && next && (
        <p>{next.playable ? `${next.name} is open.` : `${next.name} is next. That round is not in yet.`}</p>
      )}
      <ul className="breakdown">
        <li>Kills {formatScore(state.parts.fromKills)}</li>
        <li>Hearts left {formatScore(state.parts.fromHearts)}</li>
        <li>Best chain {state.parts.bestChain}</li>
      </ul>
      {state.practice ? (
        <p className="fine">Practice stays off the board and does not open the next stop.</p>
      ) : posted ? (
        <p>{posted}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <label>
            Name on the board
            <input value={name} maxLength={16} suppressHydrationWarning onChange={(event) => setName(event.target.value)} autoComplete="nickname" />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="secondary" type="submit" disabled={sending}>{sending ? "Posting" : "Post score"}</button>
        </form>
      )}
      <button className="primary" onClick={onRetry}>Retry</button>
      {offerPractice && !state.practice && state.status === "lost" && (
        <button className="secondary" onClick={onPractice}>Practice this stop</button>
      )}
      <button className="ghost" onClick={onMap}>Back to the map</button>
    </div>
  );
}

function Board({
  destination,
  onDestination,
  onBack,
}: {
  destination: string;
  onDestination: (id: string) => void;
  onBack: () => void;
}) {
  const format = levelCoat(destination).format;
  const [bucket, setBucket] = useState<Bucket>("free");
  const [rows, setRows] = useState<{ name: string; score: number; hearts: number; chain: number }[] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancel = false;
    setRows(null);
    fetch(`/api/board?destination=${destination}&format=${format}&bucket=${bucket}&day=${denverDay()}`)
      .then((response) => response.json())
      .then((payload: { rows?: { name: string; score: number; hearts: number; chain: number }[]; shared?: boolean }) => {
        if (cancel) return;
        setRows(payload.rows ?? []);
        if (payload.shared === false) setNote("This phone cannot see the shared board yet.");
      })
      .catch(() => {
        if (!cancel) setNote("The board did not answer.");
      });
    return () => {
      cancel = true;
    };
  }, [destination, format, bucket]);

  return (
    <section className="scroll">
      <button className="back" onClick={onBack}>All stops</button>
      <header className="mast">
        <p className="eyebrow">Best posted run</p>
        <h1>Leaderboard</h1>
        <p>One name per phone. No password. Practice runs stay off.</p>
      </header>
      <div className="choices filters">
        {DESTINATIONS.filter((stop) => stop.playable).map((stop) => (
          <button key={stop.id} className={destination === stop.id ? "choice on" : "choice"} onClick={() => onDestination(stop.id)}>
            <strong>{stop.name}</strong>
          </button>
        ))}
      </div>
      <div className="choices filters">
        <button className={bucket === "free" ? "choice on" : "choice"} onClick={() => setBucket("free")}><strong>Free play</strong></button>
        <button className={bucket === "daily" ? "choice on" : "choice"} onClick={() => setBucket("daily")}><strong>Daily</strong></button>
      </div>
      {note && <p className="fine">{note}</p>}
      {rows == null && <p>Loading the board.</p>}
      {rows?.length === 0 && <p>No posted runs yet.</p>}
      <ol className="board">
        {rows?.map((row, index) => (
          <li key={`${row.name}-${index}`}>
            <span>{index + 1}</span>
            <strong>{row.name}</strong>
            <em>{formatScore(row.score)}</em>
          </li>
        ))}
      </ol>
    </section>
  );
}
