// Read only the tail without traversing huge arrays / Immutable Lists
export function getLastNMessages(data, n) {
  if (!data) return []

  // Immutable.List-like
  if (typeof data.size === "number" && typeof data.get === "function") {
    const out = []
    const start = Math.max(0, data.size - n)
    for (let i = start; i < data.size; i++) out.push(data.get(i))
    return out
  }

  // Array-like
  if (Array.isArray(data)) return data.slice(-n)

  return []
}
// for after nav intent implementation, message extractioon
export function extractAssistantText(raw) {
  if (raw == null) return ""

  // If backend already returns an object
  if (typeof raw === "object") {
    if (typeof raw.reply === "string") return raw.reply
    if (typeof raw.text === "string") return raw.text
    if (typeof raw.content === "string") return raw.content

    // Common nested shapes
    if (raw.message && typeof raw.message.reply === "string")
      return raw.message.reply
    if (raw.data && typeof raw.data.reply === "string") return raw.data.reply

    // Last resort: don't show JSON to the user
    return ""
  }

  let s = String(raw).trim()
  if (!s) return ""

  // 1) Remove leading "JSON" label lines (your screenshot case)
  s = s.replace(/^\s*JSON\s*\n/i, "").trim()

  // 2) Strip markdown fences if present
  // handle full fenced blocks
  const fenced = s.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) s = fenced[1].trim()
  // handle weird partial fences
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json|JSON)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
  }

  // After stripping, re-remove "JSON" again (sometimes inside fences)
  s = s.replace(/^\s*JSON\s*\n/i, "").trim()

  // 3) If it’s JSON-ish, parse and extract reply
  const looksLikeJson =
    (s.startsWith("{") && s.endsWith("}")) ||
    (s.startsWith("[") && s.endsWith("]"))

  if (!looksLikeJson) return s // IMPORTANT: return cleaned string, not raw

  try {
    const parsed = JSON.parse(s)

    if (parsed && typeof parsed === "object") {
      if (typeof parsed.reply === "string") return parsed.reply
      if (typeof parsed.text === "string") return parsed.text
      if (typeof parsed.content === "string") return parsed.content

      if (parsed.message && typeof parsed.message.reply === "string")
        return parsed.message.reply

      // If it's still an object but no known text field:
      // do NOT stringify to UI (prevents showing JSON again)
      return ""
    }

    // If parsed is primitive
    return String(parsed ?? "")
  } catch {
    // Not valid JSON after all -> show cleaned
    return s
  }
}
