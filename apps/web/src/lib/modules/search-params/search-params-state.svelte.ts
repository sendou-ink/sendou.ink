import { goto } from "$app/navigation";
import { page } from "$app/state";
import type {
	ParamDef,
	SearchParamsDefinition,
	SearchParamsValues,
} from "./search-params.ts";
import * as SearchParams from "./search-params.ts";

type AnyShape = Record<string, ParamDef<any>>;

/**
 * Typed search params state for a whole definition.
 *
 * `current` tracks the URL reactively. Writes are merges: params not mentioned
 * are preserved, declared `resets` are applied and values equal to their
 * default are removed from the URL. Every write is one shallow replace
 * navigation — it reruns nothing by itself. Queries are keyed on their
 * (decoded) args, so a write refetches exactly the queries whose args a
 * component derives from the changed params.
 */
export function searchParamsState<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
) {
	// shallow navigations leave page.url stale; their target is page.shallow.url
	const relevantSearch = $derived(
		SearchParams.pickRelevantSearch(
			definition.keys,
			(page.shallow?.url ?? page.url).search,
		),
	);
	const values = $derived(
		definition.parse(new URLSearchParams(relevantSearch)),
	);

	function set(updates: Partial<SearchParamsValues<Shape>>) {
		const current = new URLSearchParams(window.location.search);
		const next = SearchParams.applyToSearchParams(
			definition,
			current,
			updates,
		);

		const queryString = next.toString();
		if (queryString === current.toString()) return;

		const url = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;

		void goto(url, { replace: true, reset: false, shallow: true });
	}

	return {
		get current(): SearchParamsValues<Shape> {
			return values;
		},
		set,
	};
}
