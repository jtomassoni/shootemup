import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#1c3144", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 16, height: 14, background: "#e85d4c", borderRadius: 8, display: "flex" }} />
      </div>
    ),
    { ...size },
  );
}
