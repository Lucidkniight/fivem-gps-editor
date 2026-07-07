# GPS Editor

A browser-based editor for drawing custom GPS routes on GTA V maps — built for FiveM racing
servers whose default waypoint routing breaks on one-way roads, alternate paths, and other
tracks the built-in GPS can't handle.

Draw a path by hand on the map, then export it as GTA world coordinates ready to feed into a
custom GPS route (e.g. FiveM's `AddPointToGpsCustomRoute` natives).

## Features

- **Pen tool** — click to draw a path point by point.
- **Move tool** — drag existing points, click a segment to insert a new point, right-click to
  delete one. Hover feedback shows whether a click will move or insert.
- **Undo / redo** and a **Clear Path** action (with a confirmation prompt).
- **Import / Export** — export the drawn path as GTA world-coordinate JSON, or re-import a
  previously exported path to keep editing it.
- **Checkpoint overlay** — paste in checkpoint JSON (gate + direction arrow) as a read-only
  visual reference while you draw.
- **Calibration tool** — the map image and GTA world coordinates are bridged by a linear
  transform. If you swap in a different map image, use the Calibrate modal (pick 3 known
  GTA coordinates on the map) to re-derive it without touching code.
- Pan, zoom, Fit View, and multiple swappable map backgrounds — including uploading your own
  map image, which is exactly what the Calibration tool is for.

## Data formats

### Importing checkpoints

The Import modal expects a JSON array of gate objects, each with a `left`/`right` offset pair
(GTA world coordinates). These render as a read-only visual reference — a gate line, a direction
arrow, and a number based on their position in the array:

```json
[
  {
    "offset": {
      "left": { "x": 123.45, "y": 678.90 },
      "right": { "x": 130.12, "y": 682.34 }
    }
  }
]
```

### Exporting / importing a path

Export Path converts the points you've drawn into GTA world coordinates:

```json
[
  { "x": 123.45, "y": 678.90, "z": 0 },
  { "x": 130.12, "y": 682.34, "z": 0 }
]
```

`z` is always `0` — the editor is a 2D top-down view with no elevation data. Pasting this same
JSON into Import Path loads it back in for further editing.

### Using an exported path (FiveM example)

The exported points map directly onto FiveM's custom GPS route natives — confirmed working
end-to-end on routes of 100+ points:

```lua
local path = { --[[ paste exported JSON here ]] }

ClearGpsCustomRoute()
StartGpsCustomRoute(209, true, true)   -- color, displayonfoot, followplayer

for _, point in ipairs(path) do
  AddPointToGpsCustomRoute(point.x, point.y, point.z)
end

SetGpsCustomRouteRender(true, 9, 9)    -- render on, radarthickness, mapthickness
```

## Getting started

```sh
npm install
npm run dev      # start the dev server
npm run build    # production build -> dist/
npm run check    # type-check with svelte-check
```

## Notes

- Everything runs client-side — there's no backend or persistence. Refreshing the page clears
  the current session's path.
- Built with Svelte 5, Vite, and TypeScript.
- MIT licensed — see [LICENSE](LICENSE).
