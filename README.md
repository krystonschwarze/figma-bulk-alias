# Bulk Alias

Figma plugin that points a whole set of variables at another set in one step, and unlinks them again.
The typical use is wiring a semantic collection to its primitives without clicking through every
variable by hand.

"Group" here means a folder inside a variable collection, the kind Figma creates from the slashes in a
variable name, so `color/base/01` sits in the group `color/base`. It has nothing to do with layer
groups on the canvas.

## What it does

Pick a source group, a target group and the target mode. Every target variable whose name matches a
source variable gets an alias pointing at it.

Matching is by **name**, not by position. Two groups can hold the same variables in a different
order, so the preview lists exactly which pairs will be written before anything happens. Names
without a counterpart, and pairs whose value types differ, are reported and left untouched.

**Remove aliases** writes a concrete value back into every aliased variable of the target group. The
value is read from the source collection's own default mode, and alias chains are followed to their
end, because mode ids are not shared between collections.

## Development

```sh
npm install
npm run dev      # rebuild dist/ on every change
npm test         # unit tests for the pure logic, via the Node test runner
npm run build    # minified production build
npm run verify   # typecheck, lint, format check, test, build
```

Import the plugin in Figma via **Plugins > Development > Import plugin from manifest** and pick
`manifest.json`. The manifest points at `dist/`, so run a build at least once before importing.

## Layout

| Path              | Role                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `src/code.ts`     | Sandbox side. Matching, aliasing and unlinking.                  |
| `src/pairing.ts`  | Group matching by leaf name. Pure, unit tested.                  |
| `src/messages.ts` | Message contract shared by both sides.                           |
| `src/ui/`         | Plugin window. `index.html` is a template, the build inlines it. |
| `ui-kit/`         | Shared design system. Synced copy, do not edit here.             |

Run `npm run sync:ui-kit` to pull the latest design system from the repo carrying the
`.ui-kit-canonical` marker, currently `figma-tidy-sections`.
