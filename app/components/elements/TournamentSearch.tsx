import clsx from "clsx";
import { sub } from "date-fns";
import * as React from "react";
import { ListBoxItem, type SelectProps } from "react-aria-components";
import type { TournamentSearchLoaderData } from "~/features/tournament/routes/to.search";
import { LocaleTime } from "../LocaleTime";
import { SearchSelect } from "./SearchSelect";
import searchSelectStyles from "./SearchSelect.module.css";
import selectStyles from "./Select.module.css";
import { useEntitySearch } from "./useEntitySearch";

type TournamentSearchItem = NonNullable<
	Extract<TournamentSearchLoaderData, { tournaments: unknown }>
>["tournaments"][number];

interface TournamentSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	initialTournamentId?: number;
	onChange?: (tournament: TournamentSearchItem | null) => void;
}

export const TournamentSearch = React.forwardRef(function TournamentSearch<
	T extends object,
>(
	{
		name,
		label,
		bottomText,
		errorText,
		initialTournamentId,
		onChange,
		...rest
	}: TournamentSearchProps<T>,
	ref?: React.Ref<HTMLButtonElement>,
) {
	const search = useEntitySearch<TournamentSearchItem>({
		buildUrl: (query) =>
			`/to/search?q=${query}&limit=6&minStartTime=${sub(new Date(), { days: 7 }).toISOString()}`,
		parseResults: parseTournamentResults,
		initialSelectedId: initialTournamentId,
		onChange,
	});

	return (
		<SearchSelect
			{...rest}
			name={name}
			label={label}
			bottomText={bottomText}
			errorText={errorText}
			ariaLabel="Tournament search"
			inputTestId="tournament-search-input"
			i18nKey="tournamentSearch"
			search={search}
			buttonRef={ref}
			renderItem={(item) => <TournamentItem item={item} />}
		/>
	);
});

function parseTournamentResults(
	data: unknown,
	query: string,
): TournamentSearchItem[] | null {
	const searchData = data as TournamentSearchLoaderData;
	if (!searchData || Array.isArray(searchData) || searchData.query !== query) {
		return null;
	}
	return searchData.tournaments;
}

function TournamentItem({ item }: { item: TournamentSearchItem }) {
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
			data-testid="tournament-search-item"
		>
			<img src={item.logoUrl} alt="" className={searchSelectStyles.logo} />
			<div className={searchSelectStyles.itemTextsContainer}>
				<span>{item.name}</span>
				<LocaleTime
					date={item.startTime}
					options={{
						day: "numeric",
						month: "numeric",
						year: "numeric",
					}}
					inline
					className={searchSelectStyles.itemAdditionalText}
				/>
			</div>
		</ListBoxItem>
	);
}
