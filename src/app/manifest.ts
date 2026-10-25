import type { MetadataRoute } from "next";
import { GAME_DESCRIPTION, GAME_TITLE } from "@/game/content";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: GAME_TITLE,
    short_name: "Lane",
    description: GAME_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#1c3144",
    theme_color: "#1c3144",
    orientation: "portrait",
  };
}
