import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#8fd3ff", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 24, fontSize: 28, color: "#1c3144", fontWeight: 800 }}>Hold the Lane</div>
        <div style={{ width: 70, height: 90, background: "#2a9d8f", borderRadius: 40, marginBottom: 28, display: "flex" }} />
      </div>
    ),
    { ...size },
  );
}
