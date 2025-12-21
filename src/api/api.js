const BASE = import.meta.env.VITE_APP_API_BASE || "http://localhost:3000"

export async function getNewSession(history) {
  const res = await fetch(`${BASE}/api/session/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_data: history,
    }),
  })
  if (!res.ok) throw new Error(`POST / failed: ${res.status}`)
  console.log("Session generated successfully...")
  return res.json()
}

export async function updateChatData(sessionId, chatData) {
  const res = await fetch(
    `${BASE}/update?session=${encodeURIComponent(
      sessionId
    )}&chatData=${encodeURIComponent(JSON.stringify(chatData))}`,
    { method: "POST" }
  )
  if (!res.ok) throw new Error(`POST /update failed: ${res.status}`)
  return res.json()
}

export async function listSessions(limit = 20) {
  const res = await fetch(
    `${BASE}/api/session/?limit=${encodeURIComponent(limit)}`
  )
  if (!res.ok) throw new Error(`GET /sessions failed: ${res.status}`)
  return res.json()
}

export async function addFeedback(payload) {
  const res = await fetch(`${BASE}/api/rating`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type || "hologram",
      session_id: payload.sessionId, // convert naming
      rating: payload.rating,
      label: payload.label,
      source: payload.source || "kiosk",
    }),
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      msg = data?.error || data?.details || msg
    } catch {}
    throw new Error(msg)
  }

  return res.json()
}
