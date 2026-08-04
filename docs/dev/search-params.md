# Search params

All URL search param handling goes through `app/modules/search-params/`. One declaration per param drives loader parsing, client state, href building and revalidation. Raw `useSearchParams`, `searchParams.get(...)` and hand-rolled query strings are not used outside the module.

## Principles

1. **Decoding is total — it never fails.** Every param has a default. Malformed or missing values silently resolve to the default. Users never see an error, redirect or crash because of a search param. Decoded types are the plain value type, never `T | undefined`.
2. **Everything declared exactly once.** Codec, default and loader-relevance live in a single definition shared by server and client. No `?? default` at call sites.
3. **Canonical URLs.** Encoding a value equal to its default removes the param from the URL. Non-canonical incoming URLs are tolerated, never redirected.
4. **Round-trip guarantee.** `decode(encode(x))` deep-equals `x` for every param, enforced by a round-trip test per definition.
5. **Context-free codecs.** A codec may only look at its own string. Validation that depends on other params or loaded data stays in app code after parsing.

## Defining params

One definition per route (or feature, when several routes share params), in a shared **non-`.server`** file named `<feature>-search-params.ts` at the feature root:

```ts
// app/features/builds/builds-search-params.ts
import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const buildsSearchParams = SearchParams.define({
	limit: SP.param(z.number().int().min(1).max(100), { default: 24, loader: true }),
	f: SP.json(buildFiltersSchema, { default: [], resets: ["limit"], loader: true }),
	focused: SP.param(z.enum(["1", "2", "3"]), { default: "1", loader: false }),
	tournament: SP.param(z.string().max(100).nullable(), { loader: true }),
});
```

Options accepted by every declaration:

- `default` (required, except for `.nullable()` schemas — those default to `null`, the only default they are allowed, so declaring it is noise) — used when the param is missing or fails to decode. Must be a static value; data-dependent defaults ("latest season the user played") use a static sentinel such as `null` and are resolved downstream in the loader/component.
- `loader` (required) — whether changing this param must run loaders. `loader: true` params write through react-router navigation; `loader: false` params write through `history.replaceState` and never trigger loaders, revalidation or full-page rerenders.
- `resets` — param keys reset to their defaults whenever this param is written (the "filter change resets `page`" idiom, declared once).
- `compress` (default `false`) — the canonical encoding is the compressed form. Only for params whose values are inherently large.

### `SP.param` and the derivation table

`SP.param(valueSchema, opts)` is the canonical declaration. The value schema is plain zod — all validation lives there, and shared schemas from `app/utils/zod.ts` plug in directly. The URL encoding is derived from the schema's type:

| Schema base type | URL encoding |
| --- | --- |
| `z.string()`, string enums/literals | as-is |
| `z.number()`, number enums/literals (incl. `numericEnum`) | `String(n)` |
| `z.boolean()` | `"true"` / `"false"` only |
| `z.array(item)` | repeated keys (`?id=1&id=2`); invalid members are dropped, not the whole array |
| `.nullable()` wrapper | unwrapped; `null` encodes as param absent. `default` is omitted (it is always `null`; passing anything else throws). `.optional()` is rejected — `.nullable()` is the project-wide convention |
| refinements (`.min`, `.max`, `.refine`, …) | validation only; a failing value resolves to the default |

Derivation is closed, not best-effort: shapes outside this table (objects, mixed-type unions, transforms, `z.preprocess`) are a `define()`-time error. Those use the explicit helpers:

| Helper | Encoding |
| --- | --- |
| `SP.json(schema, opts)` | `JSON.stringify` in a single value — for objects and whole-array-as-one-param values |
| `SP.custom(codec, opts)` | anything — pass a `z.codec(z.string(), valueSchema, { decode, encode })` directly |
| `SP.page(opts?)` | the paginated route's `page` param (1-based, `loader: true`, default `1`, `max` overridable) |

Note: schemas built with `z.preprocess` (like `weaponSplId`, `stageId` in `app/utils/zod.ts`) are pipes and rejected — use the inner schema (`numericEnum(mainWeaponIds)`, `numericEnum(stageIds)`) since string→number conversion is the codec's job.

### Compression

Any param can arrive compressed (an `lz~` prefix followed by a deflate + base64url payload) without declaring anything — decode transparently decompresses first. Encoding stays human-readable except for `compress: true` params and on-demand compact links via `definition.href(path, values, { compress: true })` (QR codes, share links). A value is only compressed when that actually shortens it, compared as percent-encoded since that is what ends up in the URL.

Since decoding happens before the value schema ever runs, a compressed arrival that inflates past 256 KiB is rejected mid-inflate and resolves to the default, so a hand-crafted URL cannot inflate to an arbitrarily large string on the server. The limit is an order of magnitude above the largest state the app produces (a tier list holding the entire item pool serializes to ~15 KB) while capping how far a URL that fits in the request line can expand.

## Loader API

```ts
export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { limit, f } = buildsSearchParams.parse(request);
	// fully typed, all defaults resolved, never throws
};
```

`parse` also accepts a `URL` or `URLSearchParams`.

## Client API

```ts
const [params, setParams] = useSearchParamsTyped(buildsSearchParams);

setParams({ f: newFilters });      // merge write: other params preserved; `resets` applied
setParams({ focused: "2" });       // loader:false only → history.replaceState, no navigation
setParams({ f: x, focused: "2" }); // mixed batch → one navigation carrying both changes
```

- Writes are merges: params not mentioned are preserved. A param written in the same batch is never reset by another param's `resets`.
- The write channel is decided per batch: if any written param is `loader: true` the whole batch goes through one navigation, otherwise `history.replaceState`. `setParams(values, { loader: false })` forces the `replaceState` channel for a write known not to change loader data (adding an inert filter placeholder, say).
- `history.replaceState` writes are invisible to react-router: `useLocation()` keeps returning the search of the last navigation, so `loader: false` params are only readable through this module.
- Values equal to their default are removed from the URL on write.
- Default navigation options are `{ replace: true, preventScrollReset: true }`, overridable per call: `setParams(values, { replace: false, preventScrollReset: false })`.
- For a focused subscription to one param: `const [weapon, setWeapon] = useSearchParam(buildsSearchParams, "weapon")` — rerenders only when that param changes.
- Setter identities are stable; safe in dependency arrays.

Pagination goes through `useSearchParamPagination({ definition, currentPage, pagesCount })` where the definition declares a numeric `page` param.

## Href building

```ts
buildsSearchParams.href(buildsPage(slug), { f: filters });
// → "/builds/splattershot?f=%5B…%5D"   (defaults omitted)
```

Used by `<Link to>` and by the query-building helpers in `app/utils/urls.ts`.

## Revalidation

`loader: false` params bypass the router entirely, which removes the need for most custom `shouldRevalidate` implementations. For routes where loader params should be compared by value:

```ts
export const shouldRevalidate = buildsSearchParams.shouldRevalidate;
// revalidates only when a loader:true param's decoded canonical value changed
```

Submissions, revalidator calls, pathname changes and unknown-param changes defer to the router default.

## Enforcement

The `no-raw-search-params` Biome plugin fails the lint on `useSearchParams()` and on `…searchParams.get/getAll/has(…)` anywhere in `app/` outside this module.

The escape hatch is `// biome-ignore lint/plugin: <reason>`, for the cases the convention genuinely does not cover: URLs this app did not route to (an OAuth provider's callback params, a URL pasted by a user), and reads where the total-decoding guarantee is wrong — a param whose absence must fail the request rather than resolve to a default.