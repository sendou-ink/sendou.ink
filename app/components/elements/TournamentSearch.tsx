import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import { format, sub } from "date-fns";
import * as React from "react";
import {
	Autocomplete,
	Button,
	Input,
	type Key,
	ListBox,
	ListBoxItem,
	Popover,
	SearchField,
	Select,
	type SelectProps,
	SelectValue,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useDebounce } from "react-use";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouLabel } from "~/components/elements/Label";
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import { CrossIcon } from "~/components/icons/Cross";
import type { TournamentSearchLoaderData } from "~/features/tournament/routes/to.search";
import { databaseTimestampToDate } from "~/utils/dates";
import { SearchIcon } from "../icons/Search";

import selectStyles from "./Select.module.css";
import tournamentSearchStyles from "./TournamentSearch.module.css";

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
	const [selectedKey, setSelectedKey] = React.useState(
		initialTournamentId ?? null,
	);
	const list = useTournamentSearch(setSelectedKey);

	const onSelectionChange = (tournamentId: number) => {
		setSelectedKey(tournamentId);
		const tournament = list.items.find(
			(tournament) =>
				typeof tournament.id === "number" && tournament.id === tournamentId,
		);
		if (tournament && typeof tournament.id === "number") {
			onChange?.(tournament as TournamentSearchItem);
		}
	};

	// clear if selected user is not in the new filtered items
	React.useEffect(() => {
		if (
			selectedKey &&
			selectedKey !== initialTournamentId &&
			!list.items.some(
				(tournament) =>
					typeof tournament.id === "number" && tournament.id === selectedKey,
			)
		) {
			setSelectedKey(null);
			onChange?.(null);
		}
	}, [list.items, selectedKey, onChange, initialTournamentId]);

	return (
		<Select
			name={name}
			placeholder=""
			selectedKey={selectedKey}
			onSelectionChange={onSelectionChange as (key: Key | null) => void}
			aria-label="Tournament search"
			{...rest}
		>
			{label ? (
				<SendouLabel required={rest.isRequired}>{label}</SendouLabel>
			) : null}
			<Button className={selectStyles.button} ref={ref}>
				<SelectValue className={tournamentSearchStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronUpDownIcon className={selectStyles.icon} />
				</span>
			</Button>
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover
				className={clsx(selectStyles.popover, tournamentSearchStyles.popover)}
			>
				<Autocomplete
					inputValue={list.filterText}
					onInputChange={list.setFilterText}
				>
					<SearchField
						aria-label="Search"
						autoFocus
						className={selectStyles.searchField}
					>
						<SearchIcon aria-hidden className={selectStyles.smallIcon} />
						<Input
							className={selectStyles.searchInput}
							data-testid="tournament-search-input"
						/>
						<Button className={selectStyles.searchClearButton}>
							<CrossIcon className={selectStyles.smallIcon} />
						</Button>
					</SearchField>
					<ListBox
						items={list.items.filter((tournament) => tournament !== undefined)}
						className={selectStyles.listBox}
					>
						{(item) => <TournamentItem item={item as TournamentSearchItem} />}
					</ListBox>
				</Autocomplete>
			</Popover>
		</Select>
	);
});

function TournamentItem({
	item,
}: {
	item:
		| TournamentSearchItem
		| {
				id: "NO_RESULTS";
		  }
		| {
				id: "PLACEHOLDER";
		  };
}) {
	const { t } = useTranslation(["common"]);

	if (typeof item.id === "string") {
		return (
			<ListBoxItem
				textValue="PLACEHOLDER"
				isDisabled
				className={tournamentSearchStyles.placeholder}
			>
				{item.id === "PLACEHOLDER"
					? t("common:forms.tournamentSearch.placeholder")
					: t("common:forms.tournamentSearch.noResults")}
			</ListBoxItem>
		);
	}

	const additionalText = () => {
		const date = databaseTimestampToDate(item.startTime);
		return format(date, "MMM d, yyyy");
	};

	return (
		<ListBoxItem
			id={item.id}
			textValue={item.name}
			className={({ isFocused, isSelected }) =>
				clsx(tournamentSearchStyles.item, {
					[selectStyles.itemFocused]: isFocused,
					[selectStyles.itemSelected]: isSelected,
				})
			}
			data-testid="tournament-search-item"
		>
			<img src={item.logoUrl} alt="" className={tournamentSearchStyles.logo} />
			<div className={tournamentSearchStyles.itemTextsContainer}>
				<span>{item.name}</span>
				{additionalText() ? (
					<div className={tournamentSearchStyles.itemAdditionalText}>
						{additionalText()}
					</div>
				) : null}
			</div>
		</ListBoxItem>
	);
}

function useTournamentSearch(
	setSelectedKey: (tournamentId: number | null) => void,
) {
	const [filterText, setFilterText] = React.useState("");

	const queryFetcher = useFetcher<TournamentSearchLoaderData>();

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(
				`/to/search?q=${filterText}&limit=6&minStartTime=${sub(new Date(), { days: 7 }).toISOString()}`,
			);
			setSelectedKey(null);
		},
		500,
		[filterText],
	);

	const items = () => {
		if (
			queryFetcher.data &&
			!Array.isArray(queryFetcher.data) &&
			queryFetcher.data.query === filterText
		) {
			if (queryFetcher.data.tournaments.length === 0) {
				return [{ id: "NO_RESULTS" }];
			}
			return queryFetcher.data.tournaments;
		}

		return [{ id: "PLACEHOLDER" }];
	};

	return {
		filterText,
		setFilterText,
		items: items(),
	};
}
