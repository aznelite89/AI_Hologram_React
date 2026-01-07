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
