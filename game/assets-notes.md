# Combat asset module

`game/assets.js` is a DOM-free, runtime Three.js procedural asset library. All instances share a compact geometry/material cache; removing one enemy should **not** dispose its geometries or materials. Call `disposeSharedCombatAssets()` only when the whole game is torn down.

## Public functions

- `createWeapon(type, accent)` → `THREE.Group`. Types: `rifle`, `sniper`, `shotgun`, `smg`, `rocket`, `grenadeLauncher`, `energy`. Local barrel direction is **+Z**. Right-hand attachment is the local origin; `userData.handGrip`, `leftGrip`, and `muzzle` are `Vector3`s. `userData.leftGripNode` and `muzzleNode` are actual child nodes for `getWorldPosition()`. Normal weapons span approximately 0.7–0.9 m; the sniper is intentionally longer. Material tint is controlled by `accent`.
- `createRobot(type)` → `THREE.Group`. Types: `walker`, `sniper`, `drone`, `bomber`, `shield`, `elite`, `boss`. Floor is y=0, facing +Z. Metadata includes `type`, `radius`, `aimHeight`, `height`, `core`, `visual`, `legs`, `arms`, `hover`, plus `muzzle` for armed models. The drone has four rotor groups; the shield robot has a separate `shield` group. `radius` is a gameplay collision radius, not a perfect bounding sphere.
- `animateRobot(robot, time, speed)` animates local limbs, fans and reactor pulse; does not mutate the enemy root transform. Set `robot.userData.isShooting=true` for a slight right-arm aiming lift.
- `createGrenade(kind)` → held/thrown grenade. Default olive fragmentation style, optional `smoke` or `energy` appearance. Pivot is near the body centre, radius is stored in `userData.radius`.
- `createPickup(kind)` → health/ammo/shield/grenade pickup with matching silhouette and a floor halo. `animatePickup(pickup,time)` provides deterministic bob/rotation without any timer.

## Visual construction

Weapons have beveled coloured receiver panels, dark grips, distinct magazine / drum / tube / rail silhouettes, inset muzzle rings, and metallic fastening details. Robots use rounded armour, dark articulated joints, warm red armour accents, red emissive twin eyes and a pulsing gold-rimmed reactor. Seven enemy silhouettes cover standard infantry, marksman, quad rotor, round bomber, shield carrier, heavy infantry, and a roughly 3.3 m heavy boss.

All surfaces use `MeshStandardMaterial`, with explicit roughness and metalness. Small emissive details provide readable targets without per-instance lights. All regular mesh parts cast and receive shadows. No files are downloaded and no external or paid service is called.

Static pieces at each animated node are merged by material. Normal guns use 8–9 mesh draws (energy: 12); drone/bomber use 15; articulated infantry use 40–46; boss uses 47. Material and merged-geometry buffers are shared between repeated copies. Standard infantry rest height is approximately 1.38 m; the boss is 3.31 m. The drone is approximately 0.66 m tall and intentionally has clearance below its hovering chassis.

Validation performed: `node --check game/assets.js`; Node construction of all 7 weapons, 7 robots and 4 pickups; finite non-empty world bounds; presence of hand/muzzle attachment nodes; repeat construction through the shared cache; a two-second local-joint animation sweep confirming the robot root position remains unchanged. These checks passed.
