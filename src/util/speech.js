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

  const pickReply = (value) => {
    if (value == null) return ""

    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean")
      return String(value)

    if (typeof value === "object") {
      if (typeof value.reply === "string") return value.reply
      if (typeof value.text === "string") return value.text
      if (typeof value.content === "string") return value.content
      if (value.message && typeof value.message.reply === "string")
        return value.message.reply
      if (value.data && typeof value.data.reply === "string")
        return value.data.reply
    }

    return ""
  }

  const tryJsonParseDeep = (text, maxDepth = 3) => {
    let current = text

    for (let i = 0; i < maxDepth; i++) {
      if (typeof current !== "string") return current

      const trimmed = current.trim()
      if (!trimmed) return ""

      try {
        current = JSON.parse(trimmed)
      } catch {
        return current
      }
    }

    return current
  }

  // If backend already returns object
  if (typeof raw === "object") {
    return pickReply(raw)
  }

  let s = String(raw).trim()
  if (!s) return ""

  // Remove leading JSON label
  s = s.replace(/^\s*JSON\s*\n/i, "").trim()

  // Strip markdown fences
  const fenced = s.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) s = fenced[1].trim()

  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json|JSON)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
  }

  s = s.replace(/^\s*JSON\s*\n/i, "").trim()

  // 1) First try deep parse on whole string
  let parsed = tryJsonParseDeep(s)
  const directReply = pickReply(parsed)
  if (directReply) return directReply

  // 2) If whole string not parseable, try extracting JSON slice
  const tryParseJsonSlice = (text, openChar, closeChar) => {
    const start = text.indexOf(openChar)
    const end = text.lastIndexOf(closeChar)
    if (start === -1 || end === -1 || end <= start) return null

    const slice = text.slice(start, end + 1).trim()
    const parsedSlice = tryJsonParseDeep(slice)
    return parsedSlice
  }

  parsed = tryParseJsonSlice(s, "{", "}")
  const objReply = pickReply(parsed)
  if (objReply) return objReply

  parsed = tryParseJsonSlice(s, "[", "]")
  const arrReply = pickReply(parsed)
  if (arrReply) return arrReply

  // 3) Last fallback: if string itself looks quoted, unquote once and retry
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    const unwrapped = s.slice(1, -1)
    const reparsed = tryJsonParseDeep(unwrapped)
    const reparsedReply = pickReply(reparsed)
    if (reparsedReply) return reparsedReply
  }

  return s
}
