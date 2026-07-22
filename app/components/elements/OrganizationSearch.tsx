import clsx from "clsx";
import * as React from "react";
import { ListBoxItem, type SelectProps } from "react-aria-components";
import { useFetcher } from "react-router";
import type { SearchLoaderData } from "~/features/search/routes/search";
import { SearchSelect } from "./SearchSelect";
import searchSelectStyles from "./SearchSelect.module.css";
import selectStyles from "./Select.module.css";
import { useEntitySearch } from "./useEntitySearch";

export type OrganizationSearchResult = Extract<
	NonNullable<SearchLoaderData>["results"][number],
	{ type: "organization" }
>;

interface OrganizationSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	initialOrganizationId?: number;
	onChange?: (organization: OrganizationSearchResult | null) => void;
}

export const OrganizationSearch = React.forwardRef(function OrganizationSearch<
	T extends object,
>(
	{
		name,
		label,
		bottomText,
		errorText,
		initialOrganizationId,
		onChange,
		...rest
	}: OrganizationSearchProps<T>,
	ref?: React.Ref<HTMLButtonElement>,
) {
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
			name={name}
			label={label}
			bottomText={bottomText}
			errorText={errorText}
			ariaLabel="Organization search"
			inputTestId="organization-search-input"
			i18nKey="organizationSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <OrganizationItem item={item} />}
		/>
	);
});

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
		<ListBoxItem
			id={item.id}
			textValue={item.name}
			className={({ isFocused, isSelected }) =>
				clsx(searchSelectStyles.item, {
					[selectStyles.itemFocused]: isFocused,
					[selectStyles.itemSelected]: isSelected,
				})
			}
			data-testid="organization-search-item"
		>
			<div className={searchSelectStyles.itemTextsContainer}>
				{item.name}
				<div className={searchSelectStyles.itemAdditionalText}>
					/{item.slug}
				</div>
			</div>
		</ListBoxItem>
	);
}
