# The designed world

Put the Blender export here as `duka-world.glb`. Vite bundles it and `../worldModel.ts`
lays it over the world drawn from code. Without the file nothing changes.

To start from the current world, open Live Operations in dev and run
`await __exportDukaWorld()` in the browser console.

Node names the app reads: `place_<key>` (a key from `../places.ts` PLACES), `scenery_compound`,
`scenery_roads`, `scenery_store_shell`, `scenery_container_truck`, `zone_*`, `station_*`,
`spawn_player_<app>`, `blocker_*`, `door_*`, `label_*`, `route_<name>_NN`.
