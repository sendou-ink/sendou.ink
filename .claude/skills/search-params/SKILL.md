---
name: search-params
description: Work with URL search param state via the unified app/modules/search-params system. Use when reading or writing query strings, URL-backed state, filters-in-URL, pagination, share links, or shouldRevalidate related to search params.
---

# Search params

All URL search param handling goes through `app/modules/search-params/`. Full reference: [docs/dev/search-params.md](../../../docs/dev/search-params.md).

## Hard rules

- Never use raw `useSearchParams`, `setSearchParams`, `searchParams.get(...)` or hand-built `?param=` strings. Exceptions (leave untouched): `__error`/`__success` toast params in `root.tsx`, `app/features/auth/core/routes.server.ts`.
- Every param has a mandatory static `default`. Decode is total: malformed/missing → default, never an error, redirect or crash.
- Never parse with `Object.fromEntries(url.searchParams)` — repeated keys are meaningful.
- Optional params use `.nullable()` with `default: null` (never `.optional()`). Data-dependent defaults use the null sentinel, resolved in loader/component.
- Every definition gets a round-trip test (`assertRoundTrips` from `app/modules/search-params/search-params-test-utils.ts`).

## Decision tree

1. **Where does the definition live?** One per route/feature in a shared non-`.server` file: `<feature>-search-params.ts` at the feature root (next to the component for shared components).
2. **`loader: true` or `false`?** Does changing the param need loaders to rerun? `true` → writes navigate. `false` → writes go through `history.replaceState`, no revalidation, no full-page rerender (right for client-only UI state: tabs, dialogs, client filters).
3. **Which declaration?**
   - `SP.param(zodSchema, opts)` — strings, numbers, booleans, enums/literals, arrays of those (repeated keys), top-level `.nullable()`. Refinements are validation-only. Pipes (`z.coerce`, `z.preprocess`, `.transform`) are a define-time error — use plain schemas; string↔number conversion is automatic (`numericEnum(...)` instead of `weaponSplId`/`stageId`).
   - `SP.json(schema, opts)` — objects / whole-array-as-one-value, JSON encoded.
   - `SP.custom(codec, opts)` — a `z.codec(z.string(), valueSchema, { decode, encode })`; decode signals failure via `payload.issues.push(...)` + `return z.NEVER` (never throw); decode may accept legacy formats, encode emits the canonical one.
4. **Resets?** "Filter change resets page" is declared once: `resets: ["page"]` on the filter param.
// xxx: compress also the keys
5. **Large values?** `compress: true` makes the compressed (`lz~` + deflate-base64url) form canonical. Any param already accepts compressed arrivals transparently; `definition.href(path, values, { compress: true })` for QR/share links.

## API cheat sheet

```ts
// server
const { limit, f } = buildsSearchParams.parse(request); // Request | URL | URLSearchParams

// client
const [params, setParams] = useSearchParamsTyped(buildsSearchParams);
setParams({ f: filters });                    // merge write; resets applied; defaults removed from URL
setParams(values, { replace: false, preventScrollReset: false }); // override defaults
const [weapon, setWeapon] = useSearchParam(buildsSearchParams, "weapon"); // focused subscription

// links
buildsSearchParams.href(buildsPage(slug), { f: filters }); // defaults omitted

// revalidation
export const shouldRevalidate = buildsSearchParams.shouldRevalidate;

// pagination
useSearchParamPagination({ definition, currentPage, pagesCount });
```

## Testing requirement

```ts
// <feature>-search-params.test.ts
assertRoundTrips(definition, { limit: [24, 1, 100], f: [[], [exampleFilter]] });
assertDecodesToDefault(definition, "limit", [[""], ["abc"], ["0"]]);
```

Include representative and edge-case values for every param. If a schema transform breaks `decode(encode(x)) === x`, encode the schema's input shape instead.
