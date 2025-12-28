import React from "react"
import mapIcon from "@nrs/assets/img/find_map.png"

const MapButton = () => {
  return (
    <button
      id="navigationBtn"
      className="action-btn kiosk-map-btn"
      onClick={() => console.log("map button clicked")}
    >
      <img src={mapIcon} height={110} width={110} alt="Map" />
    </button>
  )
}

export default MapButton
