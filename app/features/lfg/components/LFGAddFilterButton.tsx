import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { FilterIcon } from "~/components/icons/Filter";
import type { LFGFilter } from "../lfg-types";

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
		<SendouMenu
			trigger={
				<SendouButton
					variant="outlined"
					size="small"
					icon={<FilterIcon />}
					data-testid="add-filter-button"
				>
					{t("lfg:addFilter")}
				</SendouButton>
			}
		>
			{Object.entries(defaultFilters).map(([tag, defaultFilter]) => (
				<SendouMenuItem
					key={tag}
					isDisabled={filters.some((filter) => filter._tag === tag)}
					onAction={() => addFilter(defaultFilter)}
				>
					{t(`lfg:filters.${tag as LFGFilter["_tag"]}`)}
				</SendouMenuItem>
			))}
		</SendouMenu>
	);
}
