# Bulk Alias

Figma plugin that points a whole set of variables at another set in one step, and unlinks them again.
The typical use is wiring a semantic collection to its primitives without clicking through every
variable by hand.

## What it does

Two operations, switched at the top of the window.

- **Link** points target variables at source variables, with one source group assigned **per target
  mode**, so a two mode semantic collection is wired in a single pass.
- **Unlink** replaces an alias with the concrete value it resolves to, following alias chains to
  their end.
- Both preview before they write and every row has a checkbox. Matching is by name rather than by
  position, and pairs with differing value types are reported instead of forced.
- Sources may sit in an enabled library, targets are always local.
- **Reload** re-reads the document without a restart.

Library sources need `enableProposedApi`, which Figma allows in development only. That keeps this
plugin out of the Community catalogue; local collections are unaffected. The reference explains the
prerequisites in full.

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

## Documentation

- [docs/reference.md](docs/reference.md): every option, the library prerequisites and the source layout.
- [ui-kit/README.md](ui-kit/README.md): the shared design system.
