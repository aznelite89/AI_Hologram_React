import React from "react"

const MicWave = ({ active = false, size = "sm" }) => {
  return (
    <span
      className={"micwave micwave--" + size + " " + (active ? "active" : "")}
      aria-hidden="true"
    >
      <span className="bar b1" />
      <span className="bar b2" />
      <span className="bar b3" />
      <span className="bar b4" />
      <span className="bar b5" />
    </span>
  )
}
export default MicWave
