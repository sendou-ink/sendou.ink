import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { Menu } from "~/components/Menu";
import { FilterIcon } from "~/components/icons/Filter";
import type { LFGFilter } from "../lfg-types";

const FilterMenuButton = React.forwardRef((props, ref) => {
	const { t } = useTranslation(["lfg"]);

	return (
		<Button
			variant="outlined"
			size="tiny"
			icon={<FilterIcon />}
			testId="add-filter-button"
			{...props}
			_ref={ref}
		>
			{t("lfg:addFilter")}
		</Button>
	);
});

const defaultFilters: Record<LFGFilter["_tag"], LFGFilter> = {
	Weapon: { _tag: "Weapon", weaponSplIds: [] },
	Type: { _tag: "Type", type: "PLAYER_FOR_TEAM" },
	Language: { _tag: "Language", language: "en" },
	PlusTier: { _tag: "PlusTier", tier: 3 },
	Timezone: { _tag: "Timezone", maxHourDifference: 3 },
	MinTier: { _tag: "MinTier", tier: "GOLD" },
	MaxTier: { _tag: "MaxTier", tier: "PLATINUM" },
};

export function LFGAddFilterButton({
	filters,
	addFilter,
}: {
	filters: LFGFilter[];
	addFilter: (filter: LFGFilter) => void;
}) {
	const { t } = useTranslation(["lfg"]);

	return (
		<Menu
			items={Object.entries(defaultFilters).map(([tag, defaultFilter]) => ({
				id: tag,
				text: t(`lfg:filters.${tag as LFGFilter["_tag"]}`),
				disabled: filters.some((filter) => filter._tag === tag),
				onClick: () => addFilter(defaultFilter),
			}))}
			button={FilterMenuButton}
		/>
	);
}
