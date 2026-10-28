import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { RECENT_PATCHES } from "~/features/builds/builds-constants";
import { BuildDateFilter } from "~/features/builds/components/BuildFilters";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { ANY_TIME } from "../build-stats-constants";
import { buildStatsSearchParams } from "../build-stats-search-params";
import styles from "./BuildStatsDateFilter.module.css";

/** Filter of the build stats pages picking the patch the builds have to be updated since. `loaderDate` is the date the loader resolved to when none is selected. */
export function BuildStatsDateFilter({ loaderDate }: { loaderDate: string }) {
	const { t } = useTranslation(["builds"]);
	const [{ date: selectedDate }, setParams] = useSearchParamsTyped(
		buildStatsSearchParams,
	);
	const date = selectedDate ?? loaderDate;

	const options = [
		{ date: ANY_TIME, label: t("builds:filters.date.anyTime") },
		...RECENT_PATCHES.map((patch) => ({
			date: patch.date,
			label: t("builds:filters.date.patch", { patch: patch.patch }),
		})),
	];

	return (
		<FilterBar
			pills={[
				{
					key: "date",
					name: t("builds:filters.updatedSince"),
					icon: <Calendar />,
					// every label takes up space so the pill keeps its width when the value changes
					formattedValue: (
						<span className={styles.value}>
							{options.map((option) => (
								<span key={option.date} aria-hidden={option.date !== date}>
									{option.label}
								</span>
							))}
						</span>
					),
					usableLoggedOut: true,
					testId: "date-filter",
					popover: (
						<BuildDateFilter
							date={date === ANY_TIME ? null : date}
							onChange={(newDate) => setParams({ date: newDate ?? ANY_TIME })}
						/>
					),
				},
			]}
		/>
	);
}
