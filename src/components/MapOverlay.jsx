import React, { useEffect, useMemo, useRef, useState } from "react"
import { useMap, Marker, useMapViewEvent } from "@mappedin/react-sdk"

const YOU_ARE_HERE_NAME = "You're here"

const MapOverlay = () => {
  const { mapData, mapView } = useMap()
  const startCoordRef = useRef(null)
  const [toast, setToast] = useState(null)

  const spaces = useMemo(() => {
    if (!mapData) return []
    return mapData.getByType("space")?.filter((s) => s?.name) || []
  }, [mapData])

  const pois = useMemo(() => {
    if (!mapData) return []
    return mapData.getByType("point-of-interest") || []
  }, [mapData])

  const youAreHerePoi = useMemo(() => {
    const key = YOU_ARE_HERE_NAME.trim().toLowerCase()
    return pois.find((p) => (p?.name || "").trim().toLowerCase() === key)
  }, [pois])

  const poisForNormalRender = useMemo(() => {
    if (!youAreHerePoi) return pois
    return pois.filter((p) => p.id !== youAreHerePoi.id)
  }, [pois, youAreHerePoi])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (!mapView) return
    spaces.forEach((space) => {
      mapView.updateState(space, { interactive: true })
    })
  }, [mapView, spaces])

  useEffect(() => {
    if (!mapView) return
    startCoordRef.current = {
      __type: "coordinate",
      latitude: 1.33325408882863,
      longitude: 103.73631647457708,
      floorId: "m_1eb00e35b7fea9c4",
      verticalOffset: 0.10000000149011612
    }

    mapView.Camera.animateTo(
      { center: startCoordRef.current, zoomLevel: 19.5 },
      { duration: 1000 }
    )
  }, [])

  useMapViewEvent(
    "click",
    async (event) => {
      mapView.Navigation.clear?.()
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
      if (clickedSpace?.doors?.length == 0) {
        showToast("The space is inaccessible")
        return
      }
      if (
        !targetCoord ||
        !targetCoord.latitude ||
        !targetCoord.longitude ||
        !targetCoord.floorId
      ) {
        console.warn("No routable coord from click (POI or space).")
        showToast("The space is inaccessible")
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
            to: targetCoord
          })
        } catch {
          directions = await mapView.getDirections(
            startCoordRef.current,
            targetCoord
          )
        }
        // console.log("targetCoord: ", targetCoord)
        if (!directions) {
          console.warn("No directions returned.")
          showToast("The space is inaccessible")
          return
        }

        mapView.Navigation.clear?.()
        mapView.Navigation.draw(directions)
      } catch (err) {
        console.error("Error while getting directions:", err)
        showToast("The space is inaccessible")
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
              boxShadow: "0px 0px 1px rgba(0,0,0,0.25)",
              fontFamily: "sans-serif",
              fontSize: "11px",
              lineHeight: 1.2,
              whiteSpace: "nowrap"
            }}
          >
            {space.name}
          </div>
        </Marker>
      ))}
      {poisForNormalRender.map((poi) => (
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
              whiteSpace: "nowrap"
            }}
          >
            {poi.name}
          </div>
        </Marker>
      ))}
      {youAreHerePoi ? (
        <Marker
          key={`you-are-here-${youAreHerePoi.id}`}
          target={youAreHerePoi}
          options={{
            interactive: false,
            placement: "right",
            rank: "always-visible"
          }}
        >
          <div className="you-here">
            <span className="you-here-dot" />
            <span className="you-here-chip">You are here</span>
          </div>
        </Marker>
      ) : null}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.9)",
            color: "#fff",
            padding: "28px 48px",
            borderRadius: "24px",
            fontSize: "28px",
            fontWeight: "700",
            textAlign: "center",
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            letterSpacing: "0.3px",
            animation: "kioskToastPop 0.25s ease-out"
          }}
        >
          🚫 The space is inaccessible
        </div>
      )}
    </>
  )
}

export default MapOverlay
