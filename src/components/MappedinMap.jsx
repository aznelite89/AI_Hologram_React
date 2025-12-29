import React from "react"
import { MapView, useMapData } from "@mappedin/react-sdk"
import FloorSwitcher from "./FloorSwitcher"
import "@nrs/css/map.css"

const MappedinMap = () => {
  const { isLoading, error, mapData } = useMapData({
    key: "mik_DUwlsWsBypbdww8je5ad50840",
    secret: "mis_dylRwkoXQb3ocvaZURE20d0wQLJ6BgEINpYw9t9EQNy9a0b1054",
    mapId: "68edec68d24915000bbf8757",
  })

  console.log("map Data: ", mapData)

  if (isLoading) return <div>Loading indoor map…</div>
  if (error) return <div>Failed to load map: {error.message}</div>

  return mapData ? (
    <div id="map">
      <MapView mapData={mapData} style={{ height: "100%", width: "100%" }}>
        <div className="map-ui-layer">
          <FloorSwitcher />
          {/* <MapOverlay /> */}
        </div>
      </MapView>
    </div>
  ) : null
}

export default MappedinMap
