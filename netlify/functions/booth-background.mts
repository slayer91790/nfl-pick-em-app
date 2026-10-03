// 🎙️ Writes the roast with Claude and saves it for /api/booth to serve.
// Background function: up to 15 minutes, so a slow model call can't time out.
import Anthropic from "@anthropic-ai/sdk";
import type { Context } from "@netlify/functions";
import { boothStore, isMember, bearer, readBoothRequest, boothKeys, SYSTEM_PROMPT } from "../lib/booth.mts";

export default async (req: Request, _context: Context) => {
  const parsed = await readBoothRequest(req);
  // Re-check membership — this endpoint is public, so it can't trust its caller.
  if (!parsed || !(await isMember(bearer(req), parsed.season))) return;

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) { console.error("booth: ANTHROPIC_API_KEY is not set"); return; }

  const store = boothStore();
  const keys = await boothKeys(parsed);
  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      // A safety-classifier decline re-runs on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Week ${parsed.week}, as of the latest final:\n${JSON.stringify(parsed.facts)}` }],
    });
    if (msg.stop_reason === "refusal") { console.warn("booth: declined", msg.stop_details); return; }

    const text = msg.content.map(b => (b.type === "text" ? b.text : "")).join("\n");
    const lines = text.split("\n")
      .map(s => s.replace(/^(?:[-*•]|\d+[.)])\s+/, "")
        // Markdown bold/italic shows up as literal asterisks in the card. Only strips
        // whole-word wrappers, so a censored "f**k" (if one slips through) isn't mangled.
        .replace(/(^|[\s"'(])(\*{1,2}|_{1,2})(\S(?:.*?\S)?)\2(?=$|[\s"'),.!?;:])/g, "$1$3")
        .trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!lines.length) return;

    const result = { lines, at: new Date().toISOString() };
    await store.setJSON(keys.result, result);
    await store.setJSON(keys.latest, result);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("booth: rate limited — next final will retry");
    else if (e instanceof Anthropic.APIError) console.error(`booth: API error ${e.status}`, e.message);
    else console.error("booth: failed", e);
  } finally {
    await store.delete(keys.pending);
  }
};
