import * as R from "remeda";
import type {
	PersistedDefinition,
	PersistedMapDefinition,
} from "~/modules/persisted-state/persisted-state";
import * as SearchParams from "~/modules/search-params/search-params";

export type ParamStatus =
	| "ok"
	/** Not in the URL, the default applies. */
	| "default"
	/** In the URL but equal to the default, the canonical URL leaves it out. */
	| "redundant"
	/** In the URL in another encoding than the canonical one, e.g. compressed. */
	| "non-canonical"
	/** In the URL but failing to decode, so the default applies. */
	| "invalid";

interface RegisteredSearchParams {
	definition: SearchParams.SearchParamsDefinition<any>;
	source: string | null;
	declaredAt: { url: string; line: number } | null;
	/** Mounted components reading the definition. */
	readers: number;
}

type AnyPersistedDefinition =
	| PersistedDefinition<any>
	| PersistedMapDefinition<any>;

/**
 * Explains the URL's search params: each definition declaring one of them, in use by the page (read by a mounted
 * component or revalidating a matched route) or passing `isPageSource` (typically the page's feature folders) with
 * every param's decoded value and status, and the URL's params no loaded definition declares. Definitions in use are
 * grouped into the page's own (`page`) and those declared outside feature folders (`shared`), the rest are `unused`.
 */
export function describeSearchParams({
	search,
	definitions,
	isPageSource,
	isRouteRevalidator,
}: {
	search: string;
	definitions: RegisteredSearchParams[];
	isPageSource: (source: string) => boolean;
	/** Whether a matched route exports the definition's `shouldRevalidate`. */
	isRouteRevalidator: (
		definition: SearchParams.SearchParamsDefinition<any>,
	) => boolean;
}) {
	const urlParams = new URLSearchParams(search);
	const urlKeys = R.unique([...urlParams.keys()]);

	const described = definitions.flatMap(
		({ definition, source, declaredAt, readers }) => {
			const revalidatesRoute = isRouteRevalidator(definition);
			const isInUse = readers > 0 || revalidatesRoute;
			const isRelevant =
				isInUse ||
				definition.keys.some((key) => urlKeys.includes(key)) ||
				(source !== null && isPageSource(source));
			if (!isRelevant) return [];

			return [
				{
					source,
					declaredAt,
					readers,
					revalidatesRoute,
					group: searchParamsGroup({ source, isInUse }),
					params: definition.keys.map((key) => {
						const raw = urlParams.getAll(key);
						const def = definition.shape[key];
						const decoded = SearchParams.decodeParam(def, raw);

						return {
							key,
							raw,
							decoded,
							isLoaderParam: def.loader,
							status: paramStatus(def, raw, decoded),
						};
					}),
				},
			];
		},
	);

	return {
		page: described.filter((entry) => entry.group === "page"),
		shared: described.filter((entry) => entry.group === "shared"),
		unused: described.filter((entry) => entry.group === "unused"),
		unknownKeys: urlKeys.filter(
			(key) =>
				!definitions.some(({ definition }) => definition.keys.includes(key)),
		),
	};
}

/**
 * The variable a definition is assigned to, read from the served module's code at the line of its `define()` call
 * e.g. `userBuildsSearchParams`. Null when the call is not assigned to one.
 */
export function declaredName(moduleCode: string, line: number) {
	return (
		moduleCode
			.split("\n")
			[line - 1]?.match(/([\w$]+)\s*=\s*[\w$.]*\bdefine\(/)?.[1] ?? null
	);
}

/**
 * Pairs each web storage entry with the persisted state definition owning it (if any loaded definition does) and
 * says whether its value decodes. Definitions with nothing stored are listed apart, their default applies.
 */
export function describeStorage({
	entries,
	definitions,
}: {
	entries: Array<{ storage: "local" | "session"; key: string; raw: string }>;
	definitions: AnyPersistedDefinition[];
}) {
	const rows = entries.map((entry) => {
		const owner =
			definitions.find(
				(definition) =>
					definition.storage === entry.storage &&
					ownsKey(definition, entry.key),
			) ?? null;
		if (!owner) {
			return { ...entry, owner, decoded: null, status: "unknown" as const };
		}

		const decoded = owner.decode(entry.raw);
		const isMalformed =
			R.isDeepEqual(decoded, owner.default) &&
			entry.raw !== owner.encode(owner.default);

		return {
			...entry,
			owner,
			decoded,
			status: isMalformed ? ("malformed" as const) : ("ok" as const),
		};
	});

	return {
		rows: R.sortBy(
			rows,
			(row) => row.status === "unknown",
			(row) => row.key,
		),
		unsetDefinitions: definitions.filter(
			(definition) =>
				!entries.some(
					(entry) =>
						entry.storage === definition.storage &&
						ownsKey(definition, entry.key),
				),
		),
	};
}

/** The storage key, or prefix for a keyed family, a definition writes to. */
export function definitionKey(definition: AnyPersistedDefinition) {
	return "key" in definition ? definition.key : `${definition.keyPrefix}*`;
}

function ownsKey(definition: AnyPersistedDefinition, key: string) {
	return "key" in definition
		? definition.key === key
		: key.startsWith(definition.keyPrefix);
}

function searchParamsGroup({
	source,
	isInUse,
}: {
	source: string | null;
	isInUse: boolean;
}) {
	if (!isInUse) return "unused" as const;

	return source === null || source.startsWith("app/features/")
		? ("page" as const)
		: ("shared" as const);
}

function paramStatus<T>(
	def: SearchParams.ParamDef<T>,
	raw: string[],
	decoded: T,
): ParamStatus {
	if (raw.length === 0) return "default";
	if (R.isDeepEqual(SearchParams.encodeParam(def, decoded), raw)) return "ok";
	if (!R.isDeepEqual(decoded, def.default)) return "non-canonical";
	if (R.isDeepEqual(def.encodePlain(def.default), raw)) return "redundant";

	return "invalid";
}
