import type { ComponentType } from "react";
import { SiDiscord, SiGithub, SiInstagram, SiSpotify, SiTiktok, SiX, SiYoutube } from "react-icons/si";
import { Globe2 } from "lucide-react";

export const CONNECTION_MODES = ["username", "link"] as const;
export type ConnectionMode = (typeof CONNECTION_MODES)[number];

export type ConnectionPlatform = "discord" | "x" | "instagram" | "tiktok" | "github" | "youtube" | "spotify" | "website";

export type ProfileConnection = {
  id: string;
  platform: ConnectionPlatform;
  mode: ConnectionMode;
  value: string;
  position: number;
};

export type ConnectionPlatformMetadata = {
  id: ConnectionPlatform;
  label: string;
  mode: ConnectionMode;
  color: string;
  icon: ComponentType<any>;
};

export const CONNECTION_PLATFORMS: readonly ConnectionPlatformMetadata[] = [
  { id: "discord", label: "Discord", mode: "username", color: "#5865F2", icon: SiDiscord },
  { id: "x", label: "X", mode: "username", color: "#F5F5F5", icon: SiX },
  { id: "instagram", label: "Instagram", mode: "username", color: "#E4405F", icon: SiInstagram },
  { id: "tiktok", label: "TikTok", mode: "username", color: "#FE2C55", icon: SiTiktok },
  { id: "github", label: "GitHub", mode: "username", color: "#F5F5F5", icon: SiGithub },
  { id: "youtube", label: "YouTube", mode: "link", color: "#FF0000", icon: SiYoutube },
  { id: "spotify", label: "Spotify", mode: "link", color: "#1DB954", icon: SiSpotify },
  { id: "website", label: "Website", mode: "link", color: "#D1D5DB", icon: Globe2 },
] as const;

export function getConnectionPlatform(platform: string): ConnectionPlatformMetadata | undefined {
  return CONNECTION_PLATFORMS.find((candidate) => candidate.id === platform);
}

export function isConnectionMode(value: string): value is ConnectionMode {
  return CONNECTION_MODES.includes(value as ConnectionMode);
}

export function isSafeConnectionUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function sanitizeConnectionValue(value: string) {
  return value.trim().replace(/^@+/, "");
}
