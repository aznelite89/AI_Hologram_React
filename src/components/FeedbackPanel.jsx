import React, { useMemo, useCallback } from "react"
import { useDispatch, useSelector } from "react-redux"
import { selectFeedback } from "../slices/feedbackSlice"
import { ArrayEqual } from "../util/common"

const RATING_CONFIG = [
  {
    rating: 1,
    label: "Very dissatisfied",
    color: "#F04C4B",
    pathD:
      "M82.6375 82.247C82.6375 82.247 74.9822 72.0398 62.2232 72.0398C49.4643 72.0398 41.8089 82.247 41.8089 82.247M39.2572 41.4184L52.0161 46.5219M72.4304 46.5219L85.1893 41.4184M113.259 61.8327C113.259 90.0189 90.4095 112.868 62.2232 112.868C34.037 112.868 11.1875 90.0189 11.1875 61.8327C11.1875 33.6464 34.037 10.7969 62.2232 10.7969C90.4095 10.7969 113.259 33.6464 113.259 61.8327Z",
  },
  {
    rating: 2,
    label: "Dissatisfied",
    color: "#F3706F",
    pathD:
      "M82.491 82.247C82.491 82.247 74.8357 72.0398 62.0767 72.0398C49.3178 72.0398 41.6625 82.247 41.6625 82.247M46.766 46.5219H46.8171M77.3875 46.5219H77.4385M113.112 61.8327C113.112 90.0189 90.263 112.868 62.0767 112.868C33.8905 112.868 11.041 90.0189 11.041 61.8327C11.041 33.6464 33.8905 10.7969 62.0767 10.7969C90.263 10.7969 113.112 33.6464 113.112 61.8327Z",
  },
  {
    rating: 3,
    label: "Neutral",
    color: "#FFE457",
    pathD:
      "M41.515 77.1434H82.3436M46.6186 46.5219H46.6696M77.24 46.5219H77.291M112.965 61.8327C112.965 90.0189 90.1155 112.868 61.9293 112.868C33.743 112.868 10.8936 90.0189 10.8936 61.8327C10.8936 33.6464 33.743 10.7969 61.9293 10.7969C90.1155 10.7969 112.965 33.6464 112.965 61.8327Z",
  },
  {
    rating: 4,
    label: "Satisfied",
    color: "#80D1AC",
    pathD:
      "M41.3675 72.0398C41.3675 72.0398 49.0229 82.247 61.7818 82.247C74.5408 82.247 82.1961 72.0398 82.1961 72.0398M46.4711 46.5219H46.5221M77.0925 46.5219H77.1436M112.818 61.8327C112.818 90.0189 89.9681 112.868 61.7818 112.868C33.5956 112.868 10.7461 90.0189 10.7461 61.8327C10.7461 33.6464 33.5956 10.7969 61.7818 10.7969C89.9681 10.7969 112.818 33.6464 112.818 61.8327Z",
  },
  {
    rating: 5,
    label: "Very satisfied",
    color: "#00A459",
    pathD:
      "M46.3246 46.5219H46.3757M76.9461 46.5219H76.9971M112.671 61.8327C112.671 90.0189 89.8216 112.868 61.6353 112.868C33.4491 112.868 10.5996 90.0189 10.5996 61.8327C10.5996 33.6464 33.4491 10.7969 61.6353 10.7969C89.8216 10.7969 112.671 33.6464 112.671 61.8327ZM92.2568 66.9362C91.0391 74.1447 87.2826 80.6796 81.6665 85.3597C76.0504 90.0398 68.9452 92.5562 61.6353 92.4541C54.3255 92.5562 47.2203 90.0398 41.6042 85.3597C35.9881 80.6796 32.2316 74.1447 31.0139 66.9362H92.2568Z",
  },
]

const clamp01 = (x) => Math.max(0, Math.min(1, x))

const FeedbackPanel = ({ sessionId }) => {
  const dispatch = useDispatch()

  const [phase, selectedRating, selectedLabel, isSubmitting, submitError] =
    useSelector((state) => {
      const fb = state.feedback
      return [
        fb.get("phase"),
        fb.get("selectedRating"),
        fb.get("selectedLabel"),
        fb.get("isSubmitting"),
        fb.get("submitError"),
      ]
    }, ArrayEqual)

  const indicatorLeft = useMemo(() => {
    if (!selectedRating) return 0
    return clamp01((selectedRating - 1) / 4) * 100
  }, [selectedRating])

  const selectedCfg = RATING_CONFIG.find(
    (x) => x.rating === Number(selectedRating)
  )

  const onSelect = useCallback(
    (cfg) => {
      dispatch(
        selectFeedback({
          rating: cfg.rating,
          label: cfg.label,
          sessionId,
        })
      )
    },
    [dispatch, sessionId]
  )

  if (phase === "thankyou" && selectedCfg) {
    return (
      <div className="thank-you-container rating-chest-mock">
        <h1 className="title">Thank you so much!</h1>

        <div className="celebration-area">
          <div className="main-emoji">
            <svg width="124" height="124" viewBox="0 0 123 124" fill="none">
              <path
                fill="none"
                d={selectedCfg.pathD}
                stroke={selectedCfg.color}
                strokeWidth="9.18643"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div
          className="progress-bar"
          style={{ background: selectedCfg.color }}
        />

        <p className="message">
          Thank you for rating the AI Hologram. Scan the QR Code to continue the
          experience
        </p>

        {isSubmitting && (
          <p className="message" style={{ opacity: 0.7 }}>
            Saving your feedback…
          </p>
        )}

        {submitError && (
          <p className="message" style={{ opacity: 0.7 }}>
            Could not save feedback
          </p>
        )}
      </div>
    )
  }

  if (!sessionId) return null

  return (
    <div className="rating-container rating-chest-mock">
      <h1 className="title">Rate your experience:</h1>

      <div className="rating-icons">
        {RATING_CONFIG.map((cfg) => (
          <button
            key={cfg.rating}
            className={`rating-icon ${
              selectedRating === cfg.rating ? "selected" : ""
            }`}
            onClick={() => onSelect(cfg)}
          >
            <svg width="25" height="25" viewBox="0 0 124 124" fill="none">
              <path
                fill="none"
                d={cfg.pathD}
                stroke={cfg.color}
                strokeWidth="9.18643"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>

      <div className="progress-bar">
        <div className="progress-section" />
        <div className="progress-section" />
        <div className="progress-section" />
        <div className="progress-section" />
        <div className="progress-section" />
        <div
          className={`progress-indicator ${selectedRating ? "visible" : ""}`}
          style={{ left: `${indicatorLeft}%` }}
        />
      </div>

      <div className={`feedback-text ${selectedLabel ? "visible" : ""}`}>
        {selectedLabel}
      </div>
    </div>
  )
}

export default FeedbackPanel
