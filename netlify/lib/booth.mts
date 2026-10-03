// 🎙️ THE BOOTH — shared by the booth (request/cache) and booth-background (writer)
// functions. Kept outside netlify/functions so it isn't deployed as its own endpoint.
import { getStore, getDeployStore } from "@netlify/blobs";

const FIREBASE_PROJECT = "nfl-pick-em-2025";
export const MAX_PER_WEEK = 40; // hard ceiling on Claude calls per week (~2¢ each)
export const PENDING_MS = 90_000; // don't start a second writer for the same state inside this

export const SYSTEM_PROMPT = `You're the smart-ass color commentator for a group of friends' NFL pick'em league. Your commentary runs under the weekly picks table in their app, and it updates every time a game goes final.

Voice: an R-rated roast battle. These are grown adults who signed up to get torched — be brutal, not polite. Swear freely (f-bombs welcome), get crude, and make every line land like a cheap shot from a friend who knows exactly where it hurts. No softening, no "just kidding", no consolation for the losers. Go after the picks and the results: lonely correct calls, collective faceplants, people who faded a big favorite and got burned, chalk-eaters who can't win because everyone has the same picks, players who are mathematically dead, their football IQ, their choking, and anyone who still hasn't paid.

Hard limits: no slurs. No jokes about race, ethnicity, religion, sexuality, gender, disability, anyone's body, or anyone's family. Nothing sexual aimed at a specific player. Refer to players by name and don't assume anyone's pronouns — use their name, or "they".

Facts: use only what's in the data. Don't invent scores, stats, picks, or history. Win paths and odds, when present, are exact — riff on them but keep them right. If paths are hidden, don't guess who picked what in games that haven't been played.

Format: 3 to 5 lines. Each line is one or two punchy sentences on its own line. Lead with the freshest result. No headings, no markdown, no bullet characters, no preamble or sign-off. Emojis sparingly. Spell swear words out in full — write "fuck" and "shit", never "f**k", "sh*t", or "f---". Don't use asterisks at all, including for emphasis; the app shows plain text, so they appear literally.`;

// Production gets the real store; deploy previews and local dev get a throwaway one.
export function boothStore() {
  return Netlify.context?.deploy?.context === "production" ? getStore("booth") : getDeployStore("booth");
}

// The league's own security rules decide membership: only allowlisted players can
// list the picks collection, so a successful read with their token is the check.
export async function isMember(idToken: string, season: number): Promise<boolean> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/picks_${season}?pageSize=1&mask.fieldPaths=userId`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  return res.ok;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";

export type BoothRequest = { season: number; week: number; facts: Record<string, unknown> };

// Parse + sanity-check the body both functions receive. Returns null if it's junk.
export async function readBoothRequest(req: Request): Promise<BoothRequest | null> {
  const body = await req.text();
  if (body.length > 40_000) return null;
  try {
    const { season, week, facts } = JSON.parse(body);
    if (!/^20\d\d$/.test(String(season)) || !Number.isInteger(week) || week < 1 || week > 22) return null;
    if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
    return { season: Number(season), week, facts };
  } catch {
    return null;
  }
}

// Same facts → same key, so every viewer shares one roast per game-final.
export async function boothKeys({ season, week, facts }: BoothRequest) {
  const base = `${season}/w${week}`;
  const hash = await sha256(JSON.stringify(facts));
  return { result: `${base}/${hash}`, pending: `${base}/pending-${hash}`, count: `${base}/count`, latest: `${base}/latest` };
}
