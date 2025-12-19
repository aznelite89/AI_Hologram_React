import { BAD_WORDS } from "../constants/BadWord.js"
import { fromJS, is } from "immutable"

export function isMobileEnv() {
  const toMatch = [
      /Android/i,
      /webOS/i,
      /iPhone/i,
      /iPod/i,
      /BlackBerry/i,
      /Windows Phone/i,
    ],
    isNotTab = isNotTablet()
  return toMatch.some((toMatchItem) => {
    return navigator.userAgent.match(toMatchItem) && isNotTab
  })
}
export function isNotTablet() {
  if (navigator.userAgent.match(/iPad/i)) return false // android tablet also return android, do not exclude here
  return window.matchMedia("(orientation: landscape)").matches
    ? window.innerHeight < 480
    : window.innerWidth < 480
}
/**
 * Convert epoch milliseconds to ISO 8601 string with timezone offset
 * @param {number|string} epochMillis - e.g. 1760748698240
 * @param {number} offsetMinutes - timezone offset in minutes (default: +480 for +08:00)
 * @returns {string} ISO formatted string e.g. "2025-10-19T08:51:38+08:00"
 */
export function toIsoWithOffset(epochMillis, offsetMinutes = 480) {
  const date = new Date(Number(epochMillis))
  const local = new Date(date.getTime() + offsetMinutes * 60 * 1000)
  const iso = local.toISOString().slice(0, -1) // remove trailing 'Z'

  const sign = offsetMinutes >= 0 ? "+" : "-"
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, "0")
  const mins = String(abs % 60).padStart(2, "0")

  return `${iso}${sign}${hours}:${mins}`
}
function buildLoosePattern(word) {
  return word.split("").join("[^a-zA-Z]*")
}

export function censorBadWords(text = "") {
  let result = text

  BAD_WORDS.forEach((word) => {
    const loosePattern = buildLoosePattern(word)
    const regex = new RegExp(loosePattern, "gi")

    result = result.replace(regex, (match) => {
      // Replace the entire detected segment with **** of proper length
      return "*".repeat(word.length)
    })
  })

  return result
}
export function ArrayEqual(left, right) {
  return is(fromJS(left), fromJS(right))
}
export const shallowEqualObj = (a, b) => {
  if (a === b) return true
  if (!a || !b) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (let i = 0; i < ak.length; i++) {
    const k = ak[i]
    if (a[k] !== b[k]) return false
  }
  return true
}

export const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()
