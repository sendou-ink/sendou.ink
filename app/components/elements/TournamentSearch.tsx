import { sub } from "date-fns";
import type * as React from "react";
import type { SelectProps } from "react-aria-components";
import type { TournamentSearchLoaderData } from "~/features/tournament/routes/to.search";
import { tournamentSearchSearchParams } from "~/features/tournament/tournament-search-params";
import { LocaleTime } from "../LocaleTime";
import {
	SearchSelect,
	SearchSelectItem,
	SearchSelectItemAdditionalText,
	SearchSelectItemLogo,
} from "./SearchSelect";
import { useEntitySearch } from "./useEntitySearch";

export type TournamentSearchItem = NonNullable<
	Extract<TournamentSearchLoaderData, { tournaments: unknown }>
>["tournaments"][number];

interface TournamentSearchProps<T extends object>
	extends Omit<SelectProps<T>, "children" | "onChange"> {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	initialTournamentId?: number;
	/** Only tournaments that have already started, instead of the default recent + upcoming window. */
	pastOnly?: boolean;
	onChange?: (tournament: TournamentSearchItem | null) => void;
	ref?: React.Ref<HTMLButtonElement>;
}

export function TournamentSearch<T extends object>({
	name,
	label,
	bottomText,
	errorText,
	initialTournamentId,
	pastOnly,
	onChange,
	ref,
	...rest
}: TournamentSearchProps<T>) {
	const search = useEntitySearch<TournamentSearchItem>({
		buildUrl: (query) =>
			pastOnly
				? tournamentSearchSearchParams.href("/to/search", {
						q: query,
						limit: 6,
						maxStartTime: new Date(),
					})
				: tournamentSearchSearchParams.href("/to/search", {
						q: query,
						limit: 6,
						minStartTime: sub(new Date(), { days: 7 }),
					}),
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
}

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
		<SearchSelectItem
			id={item.id}
			textValue={item.name}
			testId="tournament-search-item"
			leading={<SearchSelectItemLogo src={item.logoUrl} />}
		>
			<span>{item.name}</span>
			<SearchSelectItemAdditionalText>
				<LocaleTime
					date={item.startsAt}
					options={{
						day: "numeric",
						month: "numeric",
						year: "numeric",
					}}
					inline
				/>
			</SearchSelectItemAdditionalText>
		</SearchSelectItem>
	);
}
