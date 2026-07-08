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
- **Undo / redo** and **Clear Path** / **Clear Checkpoints** actions (with a confirmation prompt).
- **Path cleanup tools**:
  - **Normalize Spacing** — splits any segment longer than a target distance into evenly-sized
    sub-segments, so no gap between points exceeds it. Only ever adds points.
  - **Simplify Path** — removes points that don't meaningfully change the path's shape
    (Ramer-Douglas-Peucker), with a live before/after point-count preview. Only ever removes
    points.
  - **Snap to Road** — reads the map image's pixels around each point and nudges it to sit
    centered between the road edges on either side, based on color similarity to whatever the
    point currently sits on.
- **Import / Export** — export the drawn path as GTA world-coordinate JSON, or re-import a
  previously exported path to keep editing it.
- **Checkpoint overlay** — paste in checkpoint JSON as a read-only visual reference while you
  draw, in either of two formats (see below). Both modals have a **Load Example Data** button
  that drops in a working sample if you just want to see it in action.
- **Calibration tool** — the map image and GTA world coordinates are bridged by a linear
  transform. If you swap in a different map image, use the Calibrate modal (pick 3 known
  GTA coordinates on the map) to re-derive it without touching code.
- Pan, zoom, Fit View, and multiple swappable map backgrounds — including uploading your own
  map image, which is exactly what the Calibration tool is for.

## Data formats

### Importing checkpoints

The Import modal supports two checkpoint formats, picked with a toggle (it won't guess — if the
pasted data looks like the other format, it'll tell you which one to switch to):

**Gate** — a JSON array of objects with a `left`/`right` offset pair (GTA world coordinates).
Renders as a gate line, direction arrow, and number:

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

**Single Point** — a JSON array of single coordinates, accepting flat `x`/`y`/`z` fields, a
nested `coords` object, or a `pos` object/array, with an optional `radius`. Renders as a numbered
dot — a semi-transparent bubble sized to match `radius` if one is given:

```json
[
  { "x": 123.45, "y": 678.90, "z": 0, "radius": 5 }
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
