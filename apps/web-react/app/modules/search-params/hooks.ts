import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import type {
	ParamDef,
	SearchParamsDefinition,
	SearchParamsValues,
} from "./search-params";
import * as SearchParams from "./search-params";
import * as Store from "./store";

type AnyShape = Record<string, ParamDef<any>>;

interface SetSearchParamsOptions {
	replace?: boolean;
	preventScrollReset?: boolean;
	/** Overrides the write channel derived from the written params' `loader`. */
	loader?: boolean;
}

type SetSearchParams<Shape extends AnyShape> = (
	updates: Partial<SearchParamsValues<Shape>>,
	opts?: SetSearchParamsOptions,
) => void;

const InitialSearchContext = React.createContext<string | null>(null);

/**
 * Provides the initial search string for server rendering and hydration.
 * Mounted once in the root route; the value never updates so consumers do not
 * rerender through it.
 */
export function SearchParamsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const location = useLocation();
	const [initialSearch] = React.useState(location.search);

	return React.createElement(
		InitialSearchContext.Provider,
		{ value: initialSearch },
		children,
	);
}

/**
 * Typed search params state for a whole definition.
 *
 * Writes are merges: params not mentioned are preserved, declared `resets`
 * are applied and values equal to their default are removed from the URL. If
 * any written param is `loader: true` the batch writes through one navigation,
 * otherwise through `history.replaceState` without triggering loaders. A write
 * known not to change loader data can force the latter with `{ loader: false }`.
 */
export function useSearchParamsTyped<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
): [SearchParamsValues<Shape>, SetSearchParams<Shape>] {
	const values = useDecodedValues(definition, definition.keys);
	const setParams = useSetSearchParams(definition);

	return [values, setParams];
}

/**
 * Focused subscription to a single param of a definition: rerenders only when
 * that param's raw string value changes.
 */
export function useSearchParam<
	Shape extends AnyShape,
	K extends keyof Shape & string,
>(
	definition: SearchParamsDefinition<Shape>,
	key: K,
): [
	SearchParamsValues<Shape>[K],
	(value: SearchParamsValues<Shape>[K], opts?: SetSearchParamsOptions) => void,
] {
	const values = useDecodedValues(definition, [key]);
	const setParams = useSetSearchParams(definition);

	const setValue = React.useCallback(
		(value: SearchParamsValues<Shape>[K], opts?: SetSearchParamsOptions) => {
			setParams({ [key]: value } as Partial<SearchParamsValues<Shape>>, opts);
		},
		[setParams, key],
	);

	return [values[key], setValue];
}

function useDecodedValues<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
	keys: string[],
): SearchParamsValues<Shape> {
	const initialSearch = React.useContext(InitialSearchContext) ?? "";

	const relevantSearch = React.useSyncExternalStore(
		Store.subscribe,
		() => SearchParams.pickRelevantSearch(keys, window.location.search),
		() => SearchParams.pickRelevantSearch(keys, initialSearch),
	);

	return React.useMemo(
		() => definition.parse(new URLSearchParams(relevantSearch)),
		[definition, relevantSearch],
	);
}

function useSetSearchParams<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
): SetSearchParams<Shape> {
	const navigate = useNavigate();
	const navigateRef = React.useRef(navigate);
	navigateRef.current = navigate;

	return React.useCallback(
		(updates, opts) => {
			const { loader, ...navigateOptions } = opts ?? {};
			const current = new URLSearchParams(window.location.search);
			const { next, navigationNeeded } = SearchParams.applyToSearchParams(
				definition,
				current,
				updates,
			);

			const queryString = next.toString();
			if (queryString === current.toString()) return;

			const url = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;

			if (loader ?? navigationNeeded) {
				navigateRef.current(url, {
					replace: true,
					preventScrollReset: true,
					...navigateOptions,
				});
			} else {
				window.history.replaceState(window.history.state, "", url);
			}
		},
		[definition],
	);
}
