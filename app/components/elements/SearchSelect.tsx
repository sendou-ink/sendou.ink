import * as React from "react";
import { useTranslation } from "react-i18next";
import styles from "./SearchSelect.module.css";
import { SendouSelect, SendouSelectItem } from "./Select";
import type { EntitySearch } from "./useEntitySearch";

const PLACEHOLDER_TEXTS = {
	organizationSearch: {
		placeholder: "common:forms.organizationSearch.placeholder",
		noResults: "common:forms.organizationSearch.noResults",
	},
	teamSearch: {
		placeholder: "common:forms.teamSearch.placeholder",
		noResults: "common:forms.teamSearch.noResults",
	},
	tournamentSearch: {
		placeholder: "common:forms.tournamentSearch.placeholder",
		noResults: "common:forms.tournamentSearch.noResults",
	},
	userSearch: {
		placeholder: "common:forms.userSearch.placeholder",
		noResults: "common:forms.userSearch.noResults",
	},
} as const;

/** Field props the entity search components (`UserSearch`, `TeamSearch`, ...) pass straight through. */
export interface SearchSelectFieldProps {
	name?: string;
	label?: string;
	bottomText?: string;
	errorText?: string;
	isRequired?: boolean;
	isDisabled?: boolean;
	className?: string;
	onBlur?: () => void;
	"data-testid"?: string;
}

interface SearchSelectProps<TItem extends { id: number; name: string }>
	extends SearchSelectFieldProps {
	ariaLabel: string;
	inputTestId: string;
	inputClassName?: string;
	i18nKey: keyof typeof PLACEHOLDER_TEXTS;
	search: EntitySearch<TItem>;
	buttonRef?: React.Ref<HTMLButtonElement>;
	renderItem: (item: TItem) => React.ReactElement;
}

/**
 * Presentational autocomplete select shared by the entity search components
 * (e.g. `UserSearch`, `TeamSearch`, `TournamentSearch`). Wire up data fetching
 * with `useEntitySearch` and pass its result as `search`.
 */
export function SearchSelect<TItem extends { id: number; name: string }>({
	name,
	label,
	bottomText,
	errorText,
	ariaLabel,
	inputTestId,
	inputClassName,
	i18nKey,
	search,
	buttonRef,
	renderItem,
	isRequired,
	isDisabled,
	className,
	onBlur,
	"data-testid": testId,
}: SearchSelectProps<TItem>) {
	return (
		<SendouSelect
			name={name}
			label={label}
			labelRequired={isRequired}
			isRequired={isRequired}
			isDisabled={isDisabled}
			className={className}
			onBlur={onBlur}
			data-testid={testId}
			selectedKey={search.selectedKey}
			onSelectionChange={(key) => {
				if (key != null) {
					search.onSelectionChange(Number(key));
				}
			}}
			aria-label={ariaLabel}
			searchInputValue={search.filterText}
			onSearchInputChange={search.setFilterText}
			search={{ testId: inputTestId, inputClassName: inputClassName ?? "" }}
			bottomText={bottomText}
			errorText={errorText}
			triggerRef={buttonRef}
			popoverClassName={styles.popover}
		>
			{search.items.map((item) =>
				typeof item.id === "string" ? (
					<PlaceholderItem key={item.id} id={item.id} i18nKey={i18nKey} />
				) : (
					React.cloneElement(renderItem(item as TItem), { key: item.id })
				),
			)}
		</SendouSelect>
	);
}

function PlaceholderItem({
	id,
	i18nKey,
}: {
	id: "PLACEHOLDER" | "NO_RESULTS";
	i18nKey: keyof typeof PLACEHOLDER_TEXTS;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouSelectItem
			id={id}
			textValue="PLACEHOLDER"
			isDisabled
			className={styles.placeholder}
		>
			{id === "PLACEHOLDER"
				? t(PLACEHOLDER_TEXTS[i18nKey].placeholder)
				: t(PLACEHOLDER_TEXTS[i18nKey].noResults)}
		</SendouSelectItem>
	);
}

/**
 * One result inside a `SearchSelect`'s list: an optional leading avatar or
 * logo, then the texts. `SearchSelectItemAdditionalText` renders the muted
 * second line, which is hidden while the item is shown in the trigger.
 */
export function SearchSelectItem({
	id,
	textValue,
	testId,
	leading,
	children,
}: {
	id: number;
	textValue: string;
	testId: string;
	leading?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<SendouSelectItem
			id={id}
			textValue={textValue}
			className={styles.item}
			data-testid={testId}
		>
			{leading}
			<div className={styles.itemTextsContainer}>{children}</div>
		</SendouSelectItem>
	);
}

export function SearchSelectItemLogo({ src }: { src: string }) {
	return <img src={src} alt="" className={styles.logo} />;
}

export function SearchSelectItemAdditionalText({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={styles.itemAdditionalText}>{children}</div>;
}
