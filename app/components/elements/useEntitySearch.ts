import * as React from "react";
import { useFetcher } from "react-router";
import { useDebounce } from "react-use";

/** Sentinel items rendered in place of real results while loading or when empty. */
export type EntitySearchPlaceholder =
	| { id: "PLACEHOLDER" }
	| { id: "NO_RESULTS" };

export type EntitySearchItem<TItem> = TItem | EntitySearchPlaceholder;

interface UseEntitySearchArgs<TItem extends { id: number }> {
	/** Builds the loader URL queried (debounced) as the user types. */
	buildUrl: (query: string) => string;
	/**
	 * Turns raw loader data into result items. Return `null` when the data does
	 * not (yet) correspond to the current query so a placeholder is shown.
	 */
	parseResults: (data: unknown, query: string) => TItem[] | null;
	/** Already resolved item to pin to the top of the list (e.g. when editing). */
	initialItem?: TItem;
	/** Id to preselect on mount even before its item is resolved. */
	initialSelectedId?: number;
	onChange?: (item: TItem | null) => void;
}

export interface EntitySearch<TItem extends { id: number }> {
	filterText: string;
	setFilterText: (text: string) => void;
	items: EntitySearchItem<TItem>[];
	selectedKey: number | null;
	onSelectionChange: (key: number) => void;
}

/**
 * Shared state + data fetching for the autocomplete search selects
 * (e.g. `UserSearch`, `TeamSearch`, `TournamentSearch`). Pair with the
 * presentational `SearchSelect` component, passing the returned value as its
 * `search` prop.
 */
export function useEntitySearch<TItem extends { id: number }>({
	buildUrl,
	parseResults,
	initialItem,
	initialSelectedId,
	onChange,
}: UseEntitySearchArgs<TItem>): EntitySearch<TItem> {
	const [filterText, setFilterText] = React.useState("");
	const [selectedKey, setSelectedKey] = React.useState<number | null>(
		initialSelectedId ?? null,
	);

	const queryFetcher = useFetcher<unknown>();

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(buildUrl(filterText));
			setSelectedKey(null);
		},
		500,
		[filterText],
	);

	React.useEffect(() => {
		if (typeof initialSelectedId === "number") {
			setSelectedKey(initialSelectedId);
		}
	}, [initialSelectedId]);

	const items = withInitialItem(
		toEntitySearchItems(parseResults(queryFetcher.data, filterText)),
		initialItem,
	);

	const realItems = items.filter(
		(item): item is TItem => typeof item.id === "number",
	);

	// clear the selection when its item is no longer among the results
	const realItemIdsKey = realItems.map((item) => item.id).join(",");
	React.useEffect(() => {
		const ids = realItemIdsKey.split(",").map(Number);
		if (
			selectedKey &&
			selectedKey !== initialSelectedId &&
			!ids.includes(selectedKey)
		) {
			setSelectedKey(null);
			onChange?.(null);
		}
	}, [realItemIdsKey, selectedKey, onChange, initialSelectedId]);

	const onSelectionChange = (key: number) => {
		setSelectedKey(key);
		const item = realItems.find((item) => item.id === key);
		if (item) {
			onChange?.(item);
		}
	};

	return { filterText, setFilterText, items, selectedKey, onSelectionChange };
}

function toEntitySearchItems<TItem extends { id: number }>(
	parsed: TItem[] | null,
): EntitySearchItem<TItem>[] {
	if (parsed === null) return [{ id: "PLACEHOLDER" }];
	if (parsed.length === 0) return [{ id: "NO_RESULTS" }];
	return parsed;
}

function withInitialItem<TItem extends { id: number }>(
	items: EntitySearchItem<TItem>[],
	initialItem?: TItem,
): EntitySearchItem<TItem>[] {
	if (!initialItem) return items;
	return [
		initialItem,
		...items.filter(
			(item) => typeof item.id !== "number" || item.id !== initialItem.id,
		),
	];
}
