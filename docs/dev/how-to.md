# How to...

Guides on how to do different things when developing sendou.ink

## Fix style/lint errors (Biome)

Run the `pnpm run biome:fix` command. Also you might want to set up Biome as an extension to your IDE and run automatically when you save a file.

## Add a new database migration

1) Run `pnpm run migrate:new "my cool feature"`. This creates `migrations/<UTC timestamp>-my-cool-feature.ts` e.g. `migrations/20260803143000-my-cool-feature.ts`. Migrations run in filename order, and the timestamp keeps two branches from claiming the same slot.
2) Fill out the generated file, replacing the `TODO`s. Use the schema builder (`trx.schema`) rather than raw SQL:

```ts
import type { Kysely } from "kysely";

/** Gives users somewhere to put their pronouns */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("User")
			.addColumn("pronouns", "text")
			.execute();
	});
}
```

New tables need `strict` appended, which the builder has no method for:

```ts
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("UserPronoun")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("user_pronoun_user_id")
			.on("UserPronoun")
			.column("userId")
			.execute();
	});
}
```

Notes:
- No need to implement the "down" migration
- Kysely does not wrap migrations in a transaction for SQLite, so wrap it yourself
- Drop to raw `` sql`...` `` only for what the builder can't express: table rebuilds, `pragma foreign_key_check`, FTS5 virtual tables, generated columns. See the [SQLite migration quirks](./database-schemas.md#sqlite-migration-quirks).
- `migrations/20260803000000-initial.ts` is the collapsed history of the 165 migrations that came before it. It only ever runs against an empty database, so leave it alone.

3) Update the typings in `app/db/tables.ts`
4) Run `pnpm run migrate up` to apply your migration (the unit test database `db-test.sqlite3` is created and migrated automatically when unit tests run)

## Update the OG images

OG images are the preview images shown when a page is shared on Discord, Bluesky etc. Every page listed in `OG_IMAGE_PAGES` (`app/utils/urls.ts`) has one of its own, the rest fall back to `default.png`.

1) Preview and tweak them on the `/admin/og-images` page (dev only). They are regular React components rendered at the real 1200x630 size.
2) With the dev server running, `pnpm run og:generate` screenshots each of them into the [assets repo](https://github.com/sendou-ink/assets) at `assets/img/og/`, expected to be a sibling folder of this one (pass a folder as an argument to write elsewhere).
3) Commit and push the images in the assets repo. They are live once its deploy workflow has run.

New pages need to be added to `OG_IMAGE_PAGES` and to `PAGE_COLORS` on the preview page. Routes opt in via `image: ogPageImage("<page>")` given to `metaTags`.

## Generate the update changelog image

The image posted on social media on update day is built from the entry files in `changelog/`.

1) Every commit with a user facing change adds one `changelog/YYYY-MM-DD-<slug>.md` per change. Frontmatter is `navItem` (optional, one of `OG_IMAGE_PAGES` or a list of them such as `navItem: [calendar, scrims]`, omitted = sendou.ink logo) and `type` (`feature` or `bug`). The body is a one line headline, optionally followed by a markdown bullet list for a bigger release. Entries are never deleted, they are the update history.
2) Preview and tweak the graphic on the `/admin/changelog-image` page (dev only). Without a `?since=<sha>` it renders every entry ever committed.
3) With the dev server running, `pnpm run changelog:image <sha-of-previous-update-commit>` writes `scripts/output/update-<date>.png` from the entries added since that commit, copies the image to the clipboard.

## Add a new translation string

1) Decide on where the translation should go. Either `common.json` which is available in every route by default or a feature specific one such as `builds.json`
2) Add the translation string to the json with some descriptive key
3) Access in code via the `useTranslation` hook

```json
// common.json
{
  ...
  "my-cool.translation": "Translated"
  ...
}
```

```tsx
// CoolComponent.tsx
export function CoolComponent() {
  const { t } = useTranslation(["common"]);

  return (
    <div>{t("common:my-cool.translation")}</div>
  )
}
```

When utilizing feature specific translations ensure the json is loaded. This is handled via the `handle` Remix function.

### Sync

Use the `pnpm run i18n:sync` command to sync translation jsons with English (removing and adding keys for each language as needed). There is not currently a check in the pipeline that this was done but it should always be ran when a new translation string has been added or removed.
