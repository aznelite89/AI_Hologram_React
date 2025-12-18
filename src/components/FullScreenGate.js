import { useFullscreenKiosk } from "./useFullScreenKiosk"

function FullscreenGate({ enabled = true, children }) {
  const { isFullscreen, requestFullscreen } = useFullscreenKiosk({ enabled })

  if (enabled && !isFullscreen) {
    return (
      <div className="kiosk-gate">
        <button className="kiosk-start" onClick={requestFullscreen}>
          Tap to Start
        </button>
      </div>
    )
  }
  return children
}
