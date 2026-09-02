import type * as React from "react";
import type { SelectProps } from "react-aria-components";
import type { SearchLoaderData } from "~/features/search/routes/search";
import {
	SearchSelect,
	SearchSelectItem,
	SearchSelectItemLogo,
} from "./SearchSelect";
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
	/** preselected on mount (e.g. when editing a linked team) */
	initialTeam?: { id: number; name: string; avatarUrl?: string | null };
	onChange?: (team: TeamSearchResult | null) => void;
	ref?: React.Ref<HTMLButtonElement>;
}

export function TeamSearch<T extends object>({
	name,
	label,
	bottomText,
	errorText,
	initialTeam,
	onChange,
	ref,
	...rest
}: TeamSearchProps<T>) {
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
}

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
		<SearchSelectItem
			id={item.id}
			textValue={item.name}
			testId="team-search-item"
			leading={
				item.avatarUrl ? (
					<SearchSelectItemLogo src={item.avatarUrl} />
				) : (
					<div className={teamSearchStyles.logoPlaceholder} />
				)
			}
		>
			<span>{item.name}</span>
		</SearchSelectItem>
	);
}
