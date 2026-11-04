import * as React from "react";
import { useFetcher } from "react-router";
import { SEARCH_DEBOUNCE_MS } from "~/features/search/search-constants";
import { useDebounce } from "~/hooks/useDebounce";

/** Sentinel items rendered in place of real results while loading or when empty. */
type EntitySearchPlaceholder = { id: "PLACEHOLDER" } | { id: "NO_RESULTS" };

type EntitySearchItem<TItem> = TItem | EntitySearchPlaceholder;

interface UseEntitySearchArgs<TItem extends { id: number }> {
	/** Builds the loader URL queried (debounced) as the user types. */
	buildUrl: (query: string) => string;
	/** Return `null` when the data does not (yet) correspond to the query, showing a placeholder. */
	parseResults: (data: unknown, query: string) => TItem[] | null;
	/** renders the selection before it is picked from the results (e.g. when editing) */
	initialItem?: TItem;
	/** preselected on mount even before its item is resolved */
	initialSelectedId?: number;
	onChange?: (item: TItem | null) => void;
}

export interface EntitySearch<TItem extends { id: number }> {
	filterText: string;
	setFilterText: (text: string) => void;
	items: EntitySearchItem<TItem>[];
	selectedKey: number | null;
	onSelectionChange: (key: number) => void;
	onOpenChange: (isOpen: boolean) => void;
}

/** State + data fetching for the entity search selects (`UserSearch` etc.); pass the result as `SearchSelect`'s `search` prop. */
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
	const [pickedItem, setPickedItem] = React.useState<TItem | null>(null);
	const [isOpen, setIsOpen] = React.useState(false);

	const queryFetcher = useFetcher<unknown>();

	const query = filterText.trim();

	useDebounce(
		() => {
			if (!query) return;
			queryFetcher.load(buildUrl(query));
		},
		SEARCH_DEBOUNCE_MS,
		[query],
	);

	const [prevInitialSelectedId, setPrevInitialSelectedId] =
		React.useState(initialSelectedId);
	if (initialSelectedId !== prevInitialSelectedId) {
		setPrevInitialSelectedId(initialSelectedId);
		if (typeof initialSelectedId === "number") {
			setSelectedKey(initialSelectedId);
		}
	}

	const selectedItem = [pickedItem, initialItem].find(
		(item) => item && item.id === selectedKey,
	);

	// the closed select renders the selection from its item, the open list shows only results
	const items: EntitySearchItem<TItem>[] =
		!isOpen && selectedItem
			? [selectedItem]
			: toEntitySearchItems(parseResults(queryFetcher.data, query));

	const onSelectionChange = (key: number) => {
		const item = items.find(
			(candidate): candidate is TItem => candidate.id === key,
		);
		setSelectedKey(key);
		if (item) {
			setPickedItem(item);
			onChange?.(item);
		}
	};

	return {
		filterText,
		setFilterText,
		items,
		selectedKey,
		onSelectionChange,
		onOpenChange: setIsOpen,
	};
}

function toEntitySearchItems<TItem extends { id: number }>(
	parsed: TItem[] | null,
): EntitySearchItem<TItem>[] {
	if (parsed === null) return [{ id: "PLACEHOLDER" }];
	if (parsed.length === 0) return [{ id: "NO_RESULTS" }];
	return parsed;
}
