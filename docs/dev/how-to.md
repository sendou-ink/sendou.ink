# How to...

Guides on how to do different things when developing sendou.ink

## Fix style/lint errors (Biome)

Run the `npm run biome:fix` command. Also you might want to set up Biome as an extension to your IDE and run automatically when you save a file.

## Add a new database migration

1) Add a new file to the migrations folder incrementing the last used number by one e.g. `011-my-cool-feature.js`. Note: there is no script to do this.
2) Take this file as a base and fill it out with your migration:

```js
export function up(db) {
	db.transaction(() => {
		// your migrations go here
	})();
}
```

Note: No need to implement the "down" migration

3) Update the typings in `app/db/tables.ts`
4) Run `npm run migrate up` to apply your migration
4) Set env var `DB_PATH=db-test.sqlite3` in `.env` file & run the `npm run migrate up` command again to update the database used in unit tests

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
