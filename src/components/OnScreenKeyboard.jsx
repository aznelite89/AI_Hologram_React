import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Keyboard from "react-simple-keyboard"
import "react-simple-keyboard/build/css/index.css"
import "@nrs/css/keyboard.css"

const OnScreenKeyboard = ({ value, onChange, onEnter }) => {
  const keyboardRef = useRef(null)
  const [layoutName, setLayoutName] = useState("default")

  const layout = useMemo(
    () => ({
      default: [
        "1 2 3 4 5 6 7 8 9 0",
        "q w e r t y u i o p",
        "a s d f g h j k l",
        "{shift} z x c v b n m {bksp}",
        "{space} {enter}",
      ],
      shift: [
        "! @ # $ % ^ & * ( )",
        "Q W E R T Y U I O P",
        "A S D F G H J K L",
        "{shift} Z X C V B N M {bksp}",
        "{space} {enter}",
      ],
    }),
    []
  )

  useEffect(() => {
    keyboardRef.current?.setInput(value || "")
  }, [value])

  const onKbChange = useCallback(
    (input) => {
      onChange?.(input)
    },
    [onChange]
  )

  const onKbKeyPress = useCallback(
    (btn) => {
      if (btn === "{shift}" || btn === "{lock}") {
        setLayoutName((p) => (p === "default" ? "shift" : "default"))
        return
      }
      if (btn === "{enter}") {
        onEnter?.((value || "").trim())
      }
    },
    [onEnter, value]
  )

  // SSR / safety..
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="kb-dock" aria-label="On-screen keyboard">
      <div className="kb-dockInner">
        <Keyboard
          keyboardRef={(r) => (keyboardRef.current = r)}
          layoutName={layoutName}
          layout={layout}
          onChange={onKbChange}
          onKeyPress={onKbKeyPress}
          display={{
            "{bksp}": "backspace",
            "{enter}": "enter",
            "{shift}": "shift",
            "{space}": "space",
          }}
        />
      </div>
    </div>,
    document.body
  )
}

export default OnScreenKeyboard
