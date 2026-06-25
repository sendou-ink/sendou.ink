# Scripts

Note: These are mostly useful if you are running the site in production as an admin, not typically for development.

---

## Add new badge to the database

```bash
pnpm exec vite-node scripts/add-badge.ts fire_green "Octofin Eliteboard"
```

## Rename display name of a badge

```bash
pnpm exec vite-node scripts/rename-badge.ts 10 "New 4v4 Sundaes"
```

## Add many badge owners

```bash
pnpm exec vite-node scripts/add-badge-winners.ts 10 "750705955909664791,79237403620945920"
```

## Converting gifs (badges) to thumbnail (.png)

```bash
sips -s format png ./sundae.gif --out .
```

## Convert many .png files to .avif

While in the folder with the images:

```bash
for i in *.png; do pnpm dlx @squoosh/cli --avif '{"cqLevel":33,"cqAlphaLevel":-1,"denoiseLevel":0,"tileColsLog2":0,"tileRowsLog2":0,"speed":6,"subsample":1,"chromaDeltaQ":false,"sharpness":0,"tune":0}' $i; done
```

Note: it only works with Node 16.

## Doing monthly update

1. Drop the whole [splat3 repository](https://github.com/Leanny/splat3) into `/scripts/dicts/splat3` (pull before).
1. Update all `CURRENT_SEASON` constants
1. Update `CURRENT_PATCH` constants
1. Update `PATCHES` constant with the late patch + remove the oldest
1. Update the stage list in `stage-ids.ts` and `create-misc-json.ts`. Add images from Lean's repository and avify them.
1. `pnpm exec vite-node scripts/create-misc-json.ts`
1. `pnpm exec vite-node scripts/create-gear-json.ts`
1. `pnpm exec vite-node scripts/create-analyzer-json.ts`
   8a. Double check that no hard-coded special damages changed
1. `pnpm exec vite-node scripts/create-object-dmg-json.ts` (also writes `damage-rate-history.json` for the params page directly into `app/features/params/data`)
1. `pnpm exec vite-node scripts/sync-weapon-params.ts` (writes the weapon/sub/special param histories for the params page, see [Sync weapon params](#sync-weapon-params))
1. Fill new weapon IDs by category to `weapon-ids.ts` (easy to take from the diff of English weapons.json)
1. Get gear IDs for each slot from /output folder and update `gear-ids.ts`.
1. Replace `object-dmg.json` with the `object-dmg.json` in /output folder
1. Replace `weapon-params.ts` with the `params.json` in /output folder
1. Delete all images inside `main-weapons`, `main-weapons-outlined`, `main-weapons-outlined-2` and `gear` folders.
1. Replace with images from Lean's repository.
1. Run the `pnpm exec vite-node scripts/replace-img-names.ts` command
1. Run the `pnpm exec vite-node scripts/replace-weapon-names.ts` command
1. Run the .avif generating command in each image folder.
2. Update manually any languages that use English `gear.json` and `weapons.json` files

## Download the production database from Render.com

Note: This is only useful if you have access to a production running on Render.com

1. Access the "Shell" tab
2. `cd /var/data`
3. `cp db.sqlite3 db-copy.sqlite3`
3. `gzip db-copy.sqlite3`
4. `wormhole send db-copy.sqlite3.gz`
5. On the receiving computer use the command shown.
6. `gunzip db-copy.sqlite3.gz`
