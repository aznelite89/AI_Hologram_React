import React, { useEffect, useMemo, useRef } from "react"
import { useMap, Marker, useMapViewEvent } from "@mappedin/react-sdk"

const MapOverlay = () => {
  const { mapData, mapView } = useMap()
  const startCoordRef = useRef(null)

  const spaces = useMemo(() => {
    if (!mapData) return []
    return mapData.getByType("space")?.filter((s) => s?.name) || []
  }, [mapData])

  const pois = useMemo(() => {
    if (!mapData) return []
    return mapData.getByType("point-of-interest") || []
  }, [mapData])

  useEffect(() => {
    if (!mapView) return

    spaces.forEach((space) => {
      mapView.updateState(space, {
        interactive: true,
      })
    })
  }, [mapView, spaces])

  useMapViewEvent(
    "click",
    async (event) => {
      const clickedMarker = event?.markers?.[0]
      let poiName = ""
      let poiCoord = null

      if (clickedMarker) {
        if (
          clickedMarker.coordinate?.latitude &&
          clickedMarker.coordinate?.longitude &&
          clickedMarker.coordinate?.floorId
        ) {
          poiCoord = clickedMarker.coordinate
          poiName = clickedMarker.name || "(POI)"
        } else {
          const matchFromPois = pois.find(
            (p) =>
              p.id === clickedMarker.id ||
              p.externalId === clickedMarker.id ||
              p.name === clickedMarker.name
          )
          if (
            matchFromPois?.coordinate?.latitude &&
            matchFromPois.coordinate?.longitude &&
            matchFromPois.coordinate?.floorId
          ) {
            poiCoord = matchFromPois.coordinate
            poiName = matchFromPois.name || "(POI)"
          }
        }
      }

      const clickedSpace = event?.spaces?.[0]
      const spaceName = clickedSpace?.name || "(Space)"
      const spaceCoord = clickedSpace?.center || null

      const targetCoord = poiCoord || spaceCoord
      const targetName = poiCoord ? poiName : spaceName

      if (
        !targetCoord ||
        !targetCoord.latitude ||
        !targetCoord.longitude ||
        !targetCoord.floorId
      ) {
        console.warn("No routable coord from click (POI or space).")
        return
      }

      if (
        startCoordRef.current &&
        targetCoord.latitude === startCoordRef.current.latitude &&
        targetCoord.longitude === startCoordRef.current.longitude &&
        targetCoord.floorId === startCoordRef.current.floorId
      ) {
        console.debug("Clicked start itself; ignoring.")
        return
      }

      if (!startCoordRef.current) {
        console.warn("Start coordinate not ready yet.")
        return
      }

      console.debug("Routing from fixed start to:", targetName, targetCoord)

      try {
        let directions
        try {
          directions = await mapView.getDirections({
            from: startCoordRef.current,
            to: targetCoord,
          })
        } catch {
          directions = await mapView.getDirections(
            startCoordRef.current,
            targetCoord
          )
        }

        if (!directions) {
          console.warn("No directions returned.")
          return
        }

        mapView.Navigation.clear?.()
        mapView.Navigation.draw(directions)
      } catch (err) {
        console.error("Error while getting directions:", err)
      }
    },
    [mapView, pois]
  )

  if (!mapData) return null

  return (
    <>
      {spaces.map((space) => (
        <Marker
          key={space.id || space.externalId}
          target={space}
          options={{ interactive: true }}
        >
          <div
            style={{
              borderRadius: "10px",
              padding: "5px",
              boxShadow: "0px 0px 1px rgba(0, 0, 0, 0.25)",
              fontFamily: "sans-serif",
              fontSize: "11px",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {space.name}
          </div>
        </Marker>
      ))}

      {pois.map((poi) => (
        <Marker key={poi.id} target={poi} options={{ interactive: true }}>
          <div
            style={{
              borderRadius: "8px",
              backgroundColor: "#000",
              color: "#fff",
              padding: "3px 5px",
              fontFamily: "sans-serif",
              fontSize: "10px",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {poi.name}
          </div>
        </Marker>
      ))}
    </>
  )
}

export default MapOverlay
