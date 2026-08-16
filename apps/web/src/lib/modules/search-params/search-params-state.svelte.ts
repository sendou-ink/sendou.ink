import { goto } from "$app/navigation";
import { page } from "$app/state";
import type {
	ParamDef,
	SearchParamsDefinition,
	SearchParamsValues,
} from "./search-params.ts";
import * as SearchParams from "./search-params.ts";

type AnyShape = Record<string, ParamDef<any>>;

interface SetSearchParamsOptions {
	/** Overrides the write channel derived from the written params' `loader`. */
	loader?: boolean;
}

/**
 * Typed search params state for a whole definition.
 *
 * `current` tracks the URL reactively. Writes are merges: params not mentioned
 * are preserved, declared `resets` are applied and values equal to their
 * default are removed from the URL. If any written param is `loader: true` the
 * batch writes through one replace navigation (queries keyed on the parsed
 * values rerun exactly when a decoded value changed), otherwise through a
 * shallow navigation that reruns nothing. A write known not to change query
 * data can force the latter with `{ loader: false }`.
 */
export function searchParamsState<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
) {
	const relevantSearch = $derived(
		SearchParams.pickRelevantSearch(definition.keys, page.url.search),
	);
	const values = $derived(
		definition.parse(new URLSearchParams(relevantSearch)),
	);

	function set(
		updates: Partial<SearchParamsValues<Shape>>,
		opts?: SetSearchParamsOptions,
	) {
		const current = new URLSearchParams(window.location.search);
		const { next, navigationNeeded } = SearchParams.applyToSearchParams(
			definition,
			current,
			updates,
		);

		const queryString = next.toString();
		if (queryString === current.toString()) return;

		const url = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;

		void goto(url, {
			replace: true,
			reset: false,
			shallow: !(opts?.loader ?? navigationNeeded),
		});
	}

	return {
		get current(): SearchParamsValues<Shape> {
			return values;
		},
		set,
	};
}
