import * as React from "react";
import { useFetcher } from "react-router";
import { useDebounce } from "~/hooks/useDebounce";

/** Sentinel items rendered in place of real results while loading or when empty. */
export type EntitySearchPlaceholder =
	| { id: "PLACEHOLDER" }
	| { id: "NO_RESULTS" };

export type EntitySearchItem<TItem> = TItem | EntitySearchPlaceholder;

interface UseEntitySearchArgs<TItem extends { id: number }> {
	/** Builds the loader URL queried (debounced) as the user types. */
	buildUrl: (query: string) => string;
	/** Return `null` when the data does not (yet) correspond to the query, showing a placeholder. */
	parseResults: (data: unknown, query: string) => TItem[] | null;
	/** pinned to the top of the list (e.g. when editing) */
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

	const queryFetcher = useFetcher<unknown>();

	const query = filterText.trim();

	useDebounce(
		() => {
			if (!query) return;
			queryFetcher.load(buildUrl(query));
			setSelectedKey(null);
		},
		500,
		[query],
	);

	const prevInitialSelectedId = React.useRef(initialSelectedId);
	if (initialSelectedId !== prevInitialSelectedId.current) {
		prevInitialSelectedId.current = initialSelectedId;
		if (typeof initialSelectedId === "number") {
			setSelectedKey(initialSelectedId);
		}
	}

	const items = withInitialItem(
		toEntitySearchItems(parseResults(queryFetcher.data, query)),
		initialItem,
	);

	const realItems = items.filter(
		(item): item is TItem => typeof item.id === "number",
	);

	// clear the selection when its item is no longer among the results
	const isSelectionValid =
		!selectedKey ||
		selectedKey === initialSelectedId ||
		realItems.length === 0 ||
		realItems.some((item) => item.id === selectedKey);
	const effectiveSelectedKey = isSelectionValid ? selectedKey : null;

	const prevEffectiveSelectedKey = React.useRef(effectiveSelectedKey);
	React.useEffect(() => {
		const selectionInvalidated =
			!isSelectionValid && prevEffectiveSelectedKey.current !== null;
		prevEffectiveSelectedKey.current = effectiveSelectedKey;
		if (selectionInvalidated) {
			setSelectedKey(null);
			onChange?.(null);
		}
	});

	const onSelectionChange = (key: number) => {
		setSelectedKey(key);
		const item = realItems.find((item) => item.id === key);
		if (item) {
			onChange?.(item);
		}
	};

	return {
		filterText,
		setFilterText,
		items,
		selectedKey: effectiveSelectedKey,
		onSelectionChange,
	};
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
