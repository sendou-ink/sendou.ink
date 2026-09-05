import * as React from "react";
import { useFetcher } from "react-router";
import type { SearchLoaderData } from "~/features/search/routes/search";
import {
	SearchSelect,
	type SearchSelectFieldProps,
	SearchSelectItem,
	SearchSelectItemAdditionalText,
} from "./SearchSelect";
import { useEntitySearch } from "./useEntitySearch";

export type OrganizationSearchResult = Extract<
	NonNullable<SearchLoaderData>["results"][number],
	{ type: "organization" }
>;

interface OrganizationSearchProps extends SearchSelectFieldProps {
	initialOrganizationId?: number;
	onChange?: (organization: OrganizationSearchResult | null) => void;
	ref?: React.Ref<HTMLButtonElement>;
}

export function OrganizationSearch({
	initialOrganizationId,
	onChange,
	ref,
	...rest
}: OrganizationSearchProps) {
	const initialOrganization = useInitialOrganization(initialOrganizationId);

	const search = useEntitySearch<OrganizationSearchResult>({
		buildUrl: (query) => `/search?q=${query}&type=organizations&limit=6`,
		parseResults: (data, query) =>
			parseOrganizationResults(data, query, initialOrganization),
		initialItem: initialOrganization,
		initialSelectedId: initialOrganizationId,
		onChange,
	});

	return (
		<SearchSelect
			{...rest}
			ariaLabel="Organization search"
			inputTestId="organization-search-input"
			i18nKey="organizationSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <OrganizationItem item={item} />}
		/>
	);
}

function parseOrganizationResults(
	data: unknown,
	query: string,
	initialOrganization?: OrganizationSearchResult,
): OrganizationSearchResult[] | null {
	const searchData = data as SearchLoaderData;
	if (!searchData || searchData.query !== query) return null;
	return searchData.results
		.filter(
			(result): result is OrganizationSearchResult =>
				result.type === "organization",
		)
		.filter((org) => org.id !== initialOrganization?.id);
}

function useInitialOrganization(initialOrganizationId?: number) {
	const fetcher = useFetcher<SearchLoaderData>();

	React.useEffect(() => {
		if (!initialOrganizationId || fetcher.state !== "idle" || fetcher.data) {
			return;
		}
		fetcher.load(
			`/search?q=${initialOrganizationId}&type=organizations&limit=1`,
		);
	}, [initialOrganizationId, fetcher]);

	return fetcher.data?.results.find(
		(result): result is OrganizationSearchResult =>
			result.type === "organization",
	);
}

function OrganizationItem({ item }: { item: OrganizationSearchResult }) {
	return (
		<SearchSelectItem
			id={item.id}
			textValue={item.name}
			testId="organization-search-item"
		>
			{item.name}
			<SearchSelectItemAdditionalText>
				/{item.slug}
			</SearchSelectItemAdditionalText>
		</SearchSelectItem>
	);
}
