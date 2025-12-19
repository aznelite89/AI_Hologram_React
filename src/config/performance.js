const envForcedLowPower = import.meta.env.VITE_LOW_POWER === "1"

const autoLowPower =
  typeof navigator !== "undefined" &&
  navigator.hardwareConcurrency &&
  navigator.hardwareConcurrency <= 4

export const LOW_POWER = envForcedLowPower || autoLowPower

export const PERF = Object.freeze({
  LOW_POWER,
  SHADOWS: !LOW_POWER,
  STATS: !LOW_POWER && import.meta.env.DEV,
  MAX_FPS: LOW_POWER ? 60 : 0, // 0 = uncapped
  PIXEL_RATIO: LOW_POWER ? 0.85 : Math.min(window.devicePixelRatio, 1),
})
