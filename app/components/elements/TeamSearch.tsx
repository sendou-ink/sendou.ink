import clsx from "clsx";
import * as React from "react";
import { ListBoxItem, type SelectProps } from "react-aria-components";
import type { SearchLoaderData } from "~/features/search/routes/search";
import { SearchSelect } from "./SearchSelect";
import searchSelectStyles from "./SearchSelect.module.css";
import selectStyles from "./Select.module.css";
import teamSearchStyles from "./TeamSearch.module.css";
import { useEntitySearch } from "./useEntitySearch";

export type TeamSearchResult = Extract<
	NonNullable<SearchLoaderData>["results"][number],
	{ type: "team" }
>;

interface TeamSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	/** Team to preselect and display on mount (e.g. when editing a linked team). */
	initialTeam?: { id: number; name: string; avatarUrl?: string | null };
	onChange?: (team: TeamSearchResult | null) => void;
}

export const TeamSearch = React.forwardRef(function TeamSearch<
	T extends object,
>(
	{
		name,
		label,
		bottomText,
		errorText,
		initialTeam,
		onChange,
		...rest
	}: TeamSearchProps<T>,
	ref?: React.Ref<HTMLButtonElement>,
) {
	const search = useEntitySearch<TeamSearchResult>({
		buildUrl: (query) => `/search?q=${query}&type=teams&limit=6`,
		parseResults: parseTeamResults,
		initialItem: initialTeam as TeamSearchResult | undefined,
		initialSelectedId: initialTeam?.id,
		onChange,
	});

	return (
		<SearchSelect
			{...rest}
			name={name}
			label={label}
			bottomText={bottomText}
			errorText={errorText}
			ariaLabel="Team search"
			inputTestId="team-search-input"
			i18nKey="teamSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <TeamItem item={item} />}
		/>
	);
});

function parseTeamResults(
	data: unknown,
	query: string,
): TeamSearchResult[] | null {
	const searchData = data as SearchLoaderData;
	if (!searchData || searchData.query !== query) return null;
	return searchData.results.filter(
		(result): result is TeamSearchResult => result.type === "team",
	);
}

function TeamItem({ item }: { item: TeamSearchResult }) {
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
			data-testid="team-search-item"
		>
			{item.avatarUrl ? (
				<img src={item.avatarUrl} alt="" className={searchSelectStyles.logo} />
			) : (
				<div className={teamSearchStyles.logoPlaceholder} />
			)}
			<div className={searchSelectStyles.itemTextsContainer}>
				<span>{item.name}</span>
			</div>
		</ListBoxItem>
	);
}
