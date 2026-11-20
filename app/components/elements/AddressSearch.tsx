import type * as React from "react";
import { VENUE_SEARCH_QUERY_MAX_LENGTH } from "~/features/calendar/calendar-constants";
import { venueSearchSearchParams } from "~/features/calendar/calendar-search-params";
import type { VenueSearchLoaderData } from "~/features/calendar/routes/calendar.venue-search";
import { CALENDAR_VENUE_SEARCH_ROUTE } from "~/utils/urls";
import {
	SearchSelect,
	type SearchSelectFieldProps,
	SearchSelectItem,
	SearchSelectItemAdditionalText,
} from "./SearchSelect";
import { useEntitySearch } from "./useEntitySearch";

export type AddressSearchResult = VenueSearchLoaderData["results"][number];

interface AddressSearchProps extends SearchSelectFieldProps {
	/** preselected on mount (e.g. when editing an event with a venue) */
	initialAddress?: AddressSearchResult;
	/** Tournament being edited, lets its editors search even without the right to add tournaments. */
	tournamentId?: number;
	onChange?: (address: AddressSearchResult | null) => void;
	ref?: React.Ref<HTMLButtonElement>;
}

/** Searches addresses and places (OpenStreetMap), e.g. for an event's venue. */
export function AddressSearch({
	initialAddress,
	tournamentId,
	onChange,
	ref,
	...rest
}: AddressSearchProps) {
	const search = useEntitySearch<AddressSearchResult>({
		buildUrl: (query) =>
			venueSearchSearchParams.href(CALENDAR_VENUE_SEARCH_ROUTE, {
				q: truncateQuery(query),
				tournamentId: tournamentId ?? null,
			}),
		parseResults: parseAddressResults,
		initialItem: initialAddress,
		initialSelectedId: initialAddress?.id,
		onChange,
	});

	return (
		<SearchSelect
			{...rest}
			ariaLabel="Address search"
			inputTestId="address-search-input"
			i18nKey="addressSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <AddressItem item={item} />}
		/>
	);
}

function parseAddressResults(
	data: unknown,
	query: string,
): AddressSearchResult[] | null | "UNAVAILABLE" {
	const searchData = data as VenueSearchLoaderData | undefined;
	if (!searchData || searchData.query !== truncateQuery(query)) return null;
	if (searchData.isUnavailable) return "UNAVAILABLE";
	return searchData.results;
}

function truncateQuery(query: string) {
	return query.slice(0, VENUE_SEARCH_QUERY_MAX_LENGTH);
}

function AddressItem({ item }: { item: AddressSearchResult }) {
	const [firstLine, ...rest] = item.placeName
		? [item.placeName, item.address]
		: item.address.split(", ");

	return (
		<SearchSelectItem
			id={item.id}
			textValue={item.name}
			testId="address-search-item"
			isWide
			triggerText={item.address}
		>
			<span>{firstLine}</span>
			<SearchSelectItemAdditionalText>
				{rest.join(", ")}
			</SearchSelectItemAdditionalText>
		</SearchSelectItem>
	);
}
