import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
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
import { useFetcher } from "react-router";
import { useDebounce } from "react-use";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouLabel } from "~/components/elements/Label";
import type { SearchLoaderData } from "~/features/search/routes/search";

import selectStyles from "./Select.module.css";
import teamSearchStyles from "./TeamSearch.module.css";

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

// xxx: can we abstract TournamentSearch, UserSearch and this?
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
	const [selectedKey, setSelectedKey] = React.useState<number | null>(
		initialTeam?.id ?? null,
	);
	const list = useTeamSearch(setSelectedKey);

	const onSelectionChange = (teamId: number) => {
		setSelectedKey(teamId);
		const team = list.items.find(
			(team) => typeof team.id === "number" && team.id === teamId,
		);
		if (team && typeof team.id === "number") {
			onChange?.(team as TeamSearchResult);
		}
	};

	// clear if selected team is not in the new filtered items
	React.useEffect(() => {
		if (
			selectedKey &&
			selectedKey !== initialTeam?.id &&
			!list.items.some(
				(team) => typeof team.id === "number" && team.id === selectedKey,
			)
		) {
			setSelectedKey(null);
			onChange?.(null);
		}
	}, [list.items, selectedKey, onChange, initialTeam?.id]);

	return (
		<Select
			name={name}
			placeholder=""
			selectedKey={selectedKey}
			onSelectionChange={onSelectionChange as (key: Key | null) => void}
			className={selectStyles.select}
			aria-label="Team search"
			{...rest}
		>
			{label ? (
				<SendouLabel required={rest.isRequired}>{label}</SendouLabel>
			) : null}
			<Button className={selectStyles.button} ref={ref}>
				<SelectValue className={teamSearchStyles.selectValue} />
				<span aria-hidden="true">
					<ChevronsUpDown className={selectStyles.icon} />
				</span>
			</Button>
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover className={clsx(selectStyles.popover, teamSearchStyles.popover)}>
				<Autocomplete
					inputValue={list.filterText}
					onInputChange={list.setFilterText}
				>
					<SearchField
						aria-label="Search"
						autoFocus
						className={selectStyles.searchField}
					>
						<Search aria-hidden className={selectStyles.icon} />
						<Input
							className={selectStyles.searchInput}
							data-testid="team-search-input"
						/>
						<Button className={selectStyles.searchClearButton}>
							<X className={selectStyles.icon} />
						</Button>
					</SearchField>
					<ListBox
						items={[
							...(initialTeam ? [initialTeam as TeamSearchResult] : []),
							...list.items.filter((team) => team.id !== initialTeam?.id),
						].filter((team) => team !== undefined)}
						className={selectStyles.listBox}
					>
						{(item) => <TeamItem item={item as TeamSearchResult} />}
					</ListBox>
				</Autocomplete>
			</Popover>
		</Select>
	);
});

function TeamItem({
	item,
}: {
	item:
		| TeamSearchResult
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
				className={teamSearchStyles.placeholder}
			>
				{item.id === "PLACEHOLDER"
					? t("common:forms.teamSearch.placeholder")
					: t("common:forms.teamSearch.noResults")}
			</ListBoxItem>
		);
	}

	return (
		<ListBoxItem
			id={item.id}
			textValue={item.name}
			className={({ isFocused, isSelected }) =>
				clsx(teamSearchStyles.item, {
					[selectStyles.itemFocused]: isFocused,
					[selectStyles.itemSelected]: isSelected,
				})
			}
			data-testid="team-search-item"
		>
			{item.avatarUrl ? (
				<img src={item.avatarUrl} alt="" className={teamSearchStyles.logo} />
			) : (
				<div className={teamSearchStyles.logoPlaceholder} />
			)}
			<div className={teamSearchStyles.itemTextsContainer}>
				<span>{item.name}</span>
			</div>
		</ListBoxItem>
	);
}

function useTeamSearch(setSelectedKey: (teamId: number | null) => void) {
	const [filterText, setFilterText] = React.useState("");

	const queryFetcher = useFetcher<SearchLoaderData>();

	useDebounce(
		() => {
			if (!filterText) return;
			queryFetcher.load(`/search?q=${filterText}&type=teams&limit=6`);
			setSelectedKey(null);
		},
		500,
		[filterText],
	);

	const items = () => {
		if (queryFetcher.data && queryFetcher.data.query === filterText) {
			const teamResults = queryFetcher.data.results.filter(
				(r): r is TeamSearchResult => r.type === "team",
			);
			if (teamResults.length === 0) {
				return [{ id: "NO_RESULTS" as const }];
			}
			return teamResults;
		}

		return [{ id: "PLACEHOLDER" as const }];
	};

	return {
		filterText,
		setFilterText,
		items: items(),
	};
}
