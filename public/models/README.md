# Ready-made 3D models

Drop `.glb` files here and list them in `src/world/models.ts`. Anything listed
replaces the procedural mesh for that slot; anything missing or broken falls
back to the procedural mesh automatically, so a bad file can never break the
scene.

Slots: `rover`, `habitat`, `solarArray`, `reactor`, `greenhouse`, `lander`.

## Where to get them

- **NASA 3D Resources** — <https://nasa3d.arc.nasa.gov/models> — rovers,
  landers, spacecraft and instruments. Most are public domain; check each
  model's own usage terms.
- **NASA/JPL** publishes glTF versions of several surface vehicles.

Convert from `.obj`/`.fbx` with Blender (File → Export → glTF 2.0) or
`gltf-transform`.

## Keep them small

`public/` is served verbatim and is not code-split, so every byte here is part
of the first load for every player. A detailed rover is often 20–50 MB. Run it
through a decimator first:

```sh
npx @gltf-transform/cli optimize in.glb out.glb --texture-compress webp
```

Under about 4 MB per model is a reasonable target. Attribution goes in the
`credit` field in `models.ts` so it travels with the entry.
