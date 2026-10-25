"use client";

import { useEffect, useRef, useState } from "react";
import { Sfx, type Ping } from "@/audio/sfx";
import type { LaneStage } from "@/render/stage";
import type { Avatar } from "@/game/content";
import { step } from "@/game/sim";
import { H, W, type Input, type RunState, type StyleId } from "@/game/types";

export function PlayField({
  run,
  runId,
  style,
  avatar,
  muted,
  music,
  showHitboxes,
  paused,
  onDone,
  onPause,
}: {
  run: RunState;
  runId: number;
  style: StyleId;
  avatar: Avatar;
  muted: boolean;
  music: boolean;
  showHitboxes: boolean;
  paused: boolean;
  onDone: (state: RunState) => void;
  onPause: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(true);
  const inputRef = useRef<Input>({ pointerX: null, left: false, right: false });
  const pausedRef = useRef(paused);
  const styleRef = useRef(style);
  const avatarRef = useRef(avatar);
  const hitboxRef = useRef(showHitboxes);
  const doneRef = useRef(false);
  styleRef.current = style;
  avatarRef.current = avatar;
  hitboxRef.current = showHitboxes;
  const sfxRef = useRef<Sfx | null>(null);
  const onDoneRef = useRef(onDone);
  const onPauseRef = useRef(onPause);
  pausedRef.current = paused;
  onDoneRef.current = onDone;
  onPauseRef.current = onPause;

  useEffect(() => {
    const sfx = new Sfx(muted, music);
    sfxRef.current = sfx;
    sfx.unlock();
    return () => {
      sfx.dispose();
      sfxRef.current = null;
    };
  }, [runId]);

  useEffect(() => {
    sfxRef.current?.setMuted(muted);
    sfxRef.current?.setMusic(music);
  }, [muted, music]);

  useEffect(() => {
    const stage = stageRef.current;
    const frameEl = frameRef.current;
    const canvas = canvasRef.current;
    const hud = hudRef.current;
    if (!stage || !frameEl || !canvas || !hud) return;
    let view: LaneStage | null = null;
    let cancelled = false;
    let disposed = false;
    const close = () => {
      if (disposed) return;
      disposed = true;
      view?.dispose();
    };
    let frame = 0;
    let last = performance.now();
    setBooting(true);
    doneRef.current = false;

    const fit = () => {
      const rect = stage.getBoundingClientRect();
      const scale = Math.min(rect.width / W, rect.height / H);
      const viewW = Math.max(1, Math.floor(W * scale));
      const viewH = Math.max(1, Math.floor(H * scale));
      frameEl.style.width = `${viewW}px`;
      frameEl.style.height = `${viewH}px`;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      view?.resize(viewW, viewH, dpr);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (view && !pausedRef.current && run.status === "running") {
        step(run, dt, inputRef.current);
        const sfx = sfxRef.current;
        if (sfx) {
          const pings = run.pings.splice(0, run.pings.length) as Ping[];
          for (const ping of pings) sfx.play(ping);
        }
      }
      view?.render(
        run,
        styleRef.current,
        avatarRef.current,
        hitboxRef.current,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        dt,
      );
      if (run.status !== "running" && !doneRef.current) {
        doneRef.current = true;
        onDoneRef.current(run);
      }
      frame = requestAnimationFrame(loop);
    };

    void import("@/render/stage").then(async ({ LaneStage: Stage }) => {
      if (cancelled) return;
      view = new Stage(canvas, hud);
      await view.load();
      if (cancelled) {
        close();
        return;
      }
      fit();
      setBooting(false);
      last = performance.now();
      frame = requestAnimationFrame(loop);
    });

    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      close();
    };
  }, [run, runId]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "a") {
        inputRef.current.left = true;
        inputRef.current.pointerX = null;
      }
      if (event.key === "ArrowRight" || event.key === "d") {
        inputRef.current.right = true;
        inputRef.current.pointerX = null;
      }
      if (event.key === "Escape") onPauseRef.current();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "a") inputRef.current.left = false;
      if (event.key === "ArrowRight" || event.key === "d") inputRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const y = ((event.clientY - rect.top) / rect.height) * H;
    if (y < H * 0.42) return;
    inputRef.current.pointerX = x;
    inputRef.current.left = false;
    inputRef.current.right = false;
  }

  return (
    <div className="stage" ref={stageRef}>
      <div className="frame" ref={frameRef}>
      <canvas ref={canvasRef} className="play-canvas" />
      <canvas
        ref={hudRef}
        className="hud-canvas"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0 && event.pointerType === "mouse") return;
          point(event);
        }}
        aria-label="The lane. Drag the lower half to aim."
      />
      {booting && <p className="loading">Bringing everyone onto the road…</p>}
      </div>
    </div>
  );
}
