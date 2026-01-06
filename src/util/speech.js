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

  if (typeof raw === "object") {
    if (typeof raw.reply === "string") return raw.reply
    if (typeof raw.text === "string") return raw.text
    if (typeof raw.content === "string") return raw.content
    try {
      return JSON.stringify(raw)
    } catch {
      return ""
    }
  }

  // string (either plain text OR JSON string)..
  if (typeof raw !== "string") return String(raw)

  const s = raw.trim()
  if (!s) return ""

  const looksLikeJson =
    (s.startsWith("{") && s.endsWith("}")) ||
    (s.startsWith("[") && s.endsWith("]"))

  if (!looksLikeJson) return raw

  try {
    const parsed = JSON.parse(s)

    if (parsed && typeof parsed === "object") {
      if (typeof parsed.reply === "string") return parsed.reply
      if (typeof parsed.text === "string") return parsed.text

      if (parsed.message && typeof parsed.message.reply === "string") {
        return parsed.message.reply
      }

      // fallback
      return JSON.stringify(parsed)
    }
  } catch {
    // not valid json, use back exisitng
    return raw
  }

  return raw
}
