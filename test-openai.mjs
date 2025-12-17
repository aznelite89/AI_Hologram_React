import OpenAI from "openai";
import { openAIAPiKey } from "./src/apikey.js";

const client = new OpenAI({ apiKey: openAIAPiKey });

try {
  const r = await client.responses.create({
    model: "gpt-4o-mini",
    input: "Say 'pong' if you can hear me."
  });
  console.log(r.output_text);
} catch (err) {
  console.error("FAILED:", err?.name, err?.message, err?.cause);
}