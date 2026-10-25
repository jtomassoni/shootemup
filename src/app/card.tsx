import { ImageResponse } from "next/og";

export const cardSize = { width: 1200, height: 630 };

export function card() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#8fd3ff",
          position: "relative",
          fontFamily: "Trebuchet MS, sans-serif",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 250, width: 420, height: 280, background: "#8eb4d4", borderRadius: 220, display: "flex" }} />
        <div style={{ position: "absolute", left: 280, top: 210, width: 460, height: 320, background: "#3f7d62", borderRadius: 230, display: "flex" }} />
        <div style={{ position: "absolute", right: 40, top: 180, width: 380, height: 340, background: "#d7e4ee", borderRadius: 200, display: "flex" }} />
        <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 180, background: "#3d4c5c", display: "flex" }} />
        <div style={{ position: "absolute", left: 590, bottom: 180, width: 18, height: 180, background: "#f4e6a6", display: "flex" }} />
        <div style={{ position: "absolute", left: 250, bottom: 168, width: 70, height: 92, background: "#2a9d8f", borderRadius: 40, display: "flex" }} />
        <div style={{ position: "absolute", left: 262, bottom: 246, width: 46, height: 46, background: "#f0c7a4", borderRadius: 24, display: "flex" }} />
        <div style={{ position: "absolute", right: 250, bottom: 250, width: 150, height: 110, background: "#f4f1de", borderRadius: 70, display: "flex" }} />
        <div style={{ position: "absolute", right: 210, bottom: 330, width: 70, height: 28, background: "#f4e6a6", borderRadius: 20, transform: "rotate(-30deg)", display: "flex" }} />
        <div style={{ position: "absolute", left: 72, top: 64, display: "flex", flexDirection: "column", color: "#1c3144" }}>
          <div style={{ fontSize: 28, letterSpacing: 4, color: "#e76f51", fontWeight: 700 }}>A TWO-MINUTE SHOOTER</div>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -3, lineHeight: 0.9 }}>Hold the Lane</div>
          <div style={{ fontSize: 32, marginTop: 12, maxWidth: 640 }}>Slide, shoot straight, and take the weapon before it gets away.</div>
        </div>
      </div>
    ),
    { ...cardSize },
  );
}
