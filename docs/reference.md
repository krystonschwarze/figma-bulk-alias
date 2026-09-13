# Bulk Alias, reference

The full version of what the README summarises.

"Group" here means a folder inside a variable collection, the kind Figma creates from the slashes in a
variable name, so `color/base/01` sits in the group `color/base`. It has nothing to do with layer
groups on the canvas.

## What it does

Two operations, switched at the top of the window.

**Link** points target variables at source variables. Pick a source collection, a target collection
and a target group, then assign a source group **per target mode**. Every target variable whose name
matches a source variable gets an alias.

The per mode assignment is the common design system shape:

```
Primitives (1 mode)                Semantic (2 modes)
├─ color/light/01..n               └─ color/surface/01..n
└─ color/dark/01..n

Light  ←  color/light
Dark   ←  color/dark          one pass, two modes written
```

A mode left on **Skip this mode** is not written, so working one mode at a time still works exactly
as before.

**Unlink** replaces an alias with the concrete value it resolves to. The value is read from the source
collection's own default mode, and alias chains are followed to their end, because mode ids are not
shared between collections.

**Reload** in the header re-reads the document without a restart, keeping the collections, the group
and the per mode assignments that are still valid. A group that was renamed in the meantime falls back
to Skip rather than keeping a stale value.

**Both operations preview before they write, and every row has a checkbox.** Matching is by name, not
by position, so two groups holding the same variables in a different order still pair correctly. Names
without a counterpart, and pairs whose value types differ, are reported and left alone. The write path
runs through the same matching function the preview uses, so the two cannot disagree.

## Library sources

**The source may live in an enabled library.** Local and library collections appear in the same
picker, library entries prefixed with the library name. Library variables are read as descriptors for
the preview, which costs no imports, and only the pairs you actually apply are pulled in with
`importVariableByKeyAsync`. Targets are always local, because a plugin cannot write variables into
someone else's library. Three prerequisites, none of which a plugin can arrange for itself:

1. `manifest.json` must carry `"permissions": ["teamlibrary"]`.
2. `manifest.json` must carry `"enableProposedApi": true`. `figma.teamLibrary` is a proposed API.
   Figma reports the same "permission not specified" message when either entry is missing, so the
   window names both.
3. The library has to be enabled in the file through the Figma UI. The plugin API cannot enable
   libraries.
4. The source collection has to **publish** its variables. Figma lists a collection in the library
   directory even when it publishes nothing, so a collection marked hidden from publishing appears in
   the picker and then returns no variables. That is common for primitive collections, whose whole
   point is that consumers should not reach past the semantic layer. Nothing in a plugin can work
   around it: Figma only hands other files what a library actually publishes.

   When a library collection comes back empty, the window offers **Check every library collection**,
   which reports the variable count for each one. That distinguishes a broken connection, where every
   collection reads zero, from a single collection that publishes nothing.

After changing either manifest entry the plugin has to be removed from **Plugins > Development** and
imported again. Figma records these at import time, so a plain re-run keeps failing even though the
code is current.

**This is why the plugin cannot be published.** Figma is explicit about `enableProposedApi`: "This
flag is only meant for development, and will not work in published plugins!" Library sources
therefore work as a development or internal plugin and would silently stop working in a Community
release. Local collections are unaffected either way.

## Layout

| Path              | Role                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `src/code.ts`     | Sandbox side. Matching, aliasing and unlinking.                  |
| `src/pairing.ts`  | Group matching by leaf name. Pure, unit tested.                  |
| `src/sources.ts`  | Local and library collections behind one interface.              |
| `src/messages.ts` | Message contract shared by both sides.                           |
| `src/ui/`         | Plugin window. `index.html` is a template, the build inlines it. |
| `ui-kit/`         | Shared design system. Synced copy, do not edit here.             |

Run `npm run sync:ui-kit` to pull the latest design system from the repo carrying the
`.ui-kit-canonical` marker, currently `figma-tidy-sections`.
