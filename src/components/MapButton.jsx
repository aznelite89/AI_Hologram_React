import React from "react"
import mapIcon from "@nrs/assets/img/find_map.png"
import backIcon from "@nrs/assets/img/back.png"
import { useDispatch } from "react-redux"
import { setPageType } from "../slices/commonSlice"
import { useSelector } from "react-redux"
import { ArrayEqual } from "../util/common"
import { Main, Map } from "../constants/PageType"

const MapButton = () => {
  const dispatch = useDispatch()
  const [selectedPageType] = useSelector((state) => {
    return [state.common.get("pageType")]
  }, ArrayEqual)

  return (
    <button
      id="navigationBtn"
      className="action-btn kiosk-map-btn"
      onClick={() => {
        const updatedVal = selectedPageType == Main ? Map : Main
        console.log("map button clicked: ", updatedVal)
        dispatch(setPageType({ pageType: updatedVal }))
      }}
    >
      <img
        src={selectedPageType == Main ? mapIcon : backIcon}
        height={110}
        width={110}
        alt="Map"
      />
    </button>
  )
}

export default MapButton
