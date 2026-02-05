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
    if (raw.message && typeof raw.message.reply === "string")
      return raw.message.reply
    if (raw.data && typeof raw.data.reply === "string") return raw.data.reply
    return ""
  }

  let s = String(raw).trim()
  if (!s) return ""

  // Remove leading "JSON" label lines
  s = s.replace(/^\s*JSON\s*\n/i, "").trim()

  //Strip markdown fences if present
  const fenced = s.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) s = fenced[1].trim()
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json|JSON)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
  }

  s = s.replace(/^\s*JSON\s*\n/i, "").trim()

  //try to extract a JSON object/array even if there is leading prose
  // Strategy:
  // - find first "{" and last "}" and try parse
  // - if fails, find first "[" and last "]" and try parse
  const tryParseJsonSlice = (text, openChar, closeChar) => {
    const start = text.indexOf(openChar)
    const end = text.lastIndexOf(closeChar)
    if (start === -1 || end === -1 || end <= start) return null
    const slice = text.slice(start, end + 1).trim()
    try {
      return { parsed: JSON.parse(slice), slice }
    } catch {
      return null
    }
  }

  // if whole thing is JSON, parse directly (your original intent)
  const looksLikeJson =
    (s.startsWith("{") && s.endsWith("}")) ||
    (s.startsWith("[") && s.endsWith("]"))

  let parsedObj = null

  if (looksLikeJson) {
    try {
      parsedObj = JSON.parse(s)
    } catch {
      // fall through to slice extraction
    }
  }

  if (parsedObj == null) {
    // Try object slice first (most common)
    const objTry = tryParseJsonSlice(s, "{", "}")
    if (objTry) parsedObj = objTry.parsed
  }

  if (parsedObj == null) {
    // Try array slice (less common)
    const arrTry = tryParseJsonSlice(s, "[", "]")
    if (arrTry) parsedObj = arrTry.parsed
  }

  // If able to parse something, extract reply
  if (parsedObj != null) {
    if (typeof parsedObj === "string") return parsedObj
    if (typeof parsedObj === "number" || typeof parsedObj === "boolean")
      return String(parsedObj)

    if (parsedObj && typeof parsedObj === "object") {
      if (typeof parsedObj.reply === "string") return parsedObj.reply
      if (typeof parsedObj.text === "string") return parsedObj.text
      if (typeof parsedObj.content === "string") return parsedObj.content

      if (parsedObj.message && typeof parsedObj.message.reply === "string")
        return parsedObj.message.reply
      return ""
    }
  }

  // nothing foud.. return cleaned prose
  return s
}
