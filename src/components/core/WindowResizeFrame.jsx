

export const WindowResizeFrame = () => {
  const handleResize = (direction) => (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    window.api?.startResizeDragging?.(direction)
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {/* Edges */}
      <div
        onMouseDown={handleResize('North')}
        className="pointer-events-auto absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize"
        title="Resize window"
      />
      <div
        onMouseDown={handleResize('South')}
        className="pointer-events-auto absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize"
        title="Resize window"
      />
      <div
        onMouseDown={handleResize('West')}
        className="pointer-events-auto absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize"
        title="Resize window"
      />
      <div
        onMouseDown={handleResize('East')}
        className="pointer-events-auto absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize"
        title="Resize window"
      />

      {/* Corners */}
      <div
        onMouseDown={handleResize('NorthWest')}
        className="pointer-events-auto absolute top-0 left-0 h-3 w-3 cursor-nwse-resize"
        title="Resize window"
      />
      <div
        onMouseDown={handleResize('NorthEast')}
        className="pointer-events-auto absolute top-0 right-0 h-3 w-3 cursor-nesw-resize"
        title="Resize window"
      />
      <div
        onMouseDown={handleResize('SouthWest')}
        className="pointer-events-auto absolute bottom-0 left-0 h-3 w-3 cursor-nesw-resize"
        title="Resize window"
      />
      <div
        onMouseDown={handleResize('SouthEast')}
        className="pointer-events-auto absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
        title="Resize window"
      />
    </div>
  )
}
