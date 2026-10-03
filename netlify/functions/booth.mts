// 🎙️ POST /api/booth — returns the roast for the week's current state.
// Cached roast → returned straight away. Otherwise kicks off booth-background to
// write one and answers { pending: true } with the last roast, if any; the app polls.
import type { Context, Config } from "@netlify/functions";
import { boothStore, isMember, bearer, readBoothRequest, boothKeys, MAX_PER_WEEK, PENDING_MS } from "../lib/booth.mts";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = bearer(req);
  if (!token) return json({ error: "Sign in first" }, 401);

  const parsed = await readBoothRequest(req.clone());
  if (!parsed) return json({ error: "Bad request" }, 400);
  if (!(await isMember(token, parsed.season))) return json({ error: "Not on the league roster" }, 403);

  const store = boothStore();
  const keys = await boothKeys(parsed);
  const cached = await store.get(keys.result, { type: "json" });
  if (cached) return json(cached);

  const latest = await store.get(keys.latest, { type: "json" });
  const started = await store.get(keys.pending, { type: "json" });
  if (started && Date.now() - started.at < PENDING_MS) return json({ ...latest, pending: true });

  const count = (await store.get(keys.count, { type: "json" })) ?? 0;
  if (count >= MAX_PER_WEEK) return json({ ...latest, capped: true });
  await store.setJSON(keys.count, count + 1);
  await store.setJSON(keys.pending, { at: Date.now() });

  // Background functions answer 202 immediately; the writer saves to the store.
  await fetch(new URL("/.netlify/functions/booth-background", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: await req.text(),
  });
  return json({ ...latest, pending: true });
};

export const config: Config = { path: "/api/booth" };
