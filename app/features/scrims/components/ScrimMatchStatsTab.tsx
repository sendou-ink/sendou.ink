// xxx: import * as React
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import type { loader } from "../loaders/scrims.$id.server";
import styles from "./ScrimMatchStatsTab.module.css";

export function ScrimMatchStatsTab() {
	const { t } = useTranslation(["scrims", "game-misc"]);
	const data = useLoaderData<typeof loader>();
	const [restrictToPool, setRestrictToPool] = useState(false);

	const viewerSide = data.mapByMap?.viewerSide;
	const maps = data.mapByMap?.maps ?? [];
	const ownList = data.mapByMap?.mapLists.find((l) => l.side === viewerSide);

	if (!viewerSide || maps.length === 0) {
		return (
			<SendouTabPanel id={TAB_KEYS.STATS}>
				<div className={styles.empty}>{t("scrims:mapByMap.stats.empty")}</div>
			</SendouTabPanel>
		);
	}

	const restrictPool =
		restrictToPool && ownList?.serializedPool
			? new MapPool(ownList.serializedPool)
			: undefined;

	const stats = ScrimMapByMap.stats(maps, viewerSide, {
		restrictToPool: restrictPool,
	});

	return (
		<SendouTabPanel id={TAB_KEYS.STATS}>
			<div className={styles.root} data-testid="scrim-stats-root">
				{ownList?.source === "POOL" && ownList.serializedPool ? (
					<label className={styles.toggleRow}>
						<input
							type="checkbox"
							checked={restrictToPool}
							onChange={(e) => setRestrictToPool(e.target.checked)}
						/>
						{t("scrims:mapByMap.stats.restrictToPool")}
					</label>
				) : null}

				<section data-testid="stats-section-byMode">
					<h3 className={styles.sectionTitle}>
						{t("scrims:mapByMap.stats.byMode")}
					</h3>
					<StatsTable
						rows={stats.byMode.map((r) => ({
							key: r.key,
							label: t(`game-misc:MODE_LONG_${r.key as "SZ"}` as const, {
								defaultValue: r.key,
							}),
							wins: r.wins,
							losses: r.losses,
						}))}
					/>
				</section>

				<section>
					<h3 className={styles.sectionTitle}>
						{t("scrims:mapByMap.stats.byStage")}
					</h3>
					<StatsTable
						rows={stats.byStage.map((r) => ({
							key: r.key,
							label: t(`game-misc:STAGE_${Number(r.key)}` as const, {
								defaultValue: r.key,
							}),
							wins: r.wins,
							losses: r.losses,
						}))}
					/>
				</section>

				<section>
					<h3 className={styles.sectionTitle}>
						{t("scrims:mapByMap.stats.byStageMode")}
					</h3>
					<StatsTable
						rows={stats.byStageMode.map((r) => {
							const [stageId, mode] = r.key.split("-");
							const stageLabel = t(
								`game-misc:STAGE_${Number(stageId)}` as const,
								{ defaultValue: stageId },
							);
							const modeLabel = t(
								`game-misc:MODE_LONG_${mode as "SZ"}` as const,
								{ defaultValue: mode },
							);
							return {
								key: r.key,
								label: `${stageLabel} — ${modeLabel}`,
								wins: r.wins,
								losses: r.losses,
							};
						})}
					/>
				</section>
			</div>
		</SendouTabPanel>
	);
}

function StatsTable({
	rows,
}: {
	rows: Array<{ key: string; label: string; wins: number; losses: number }>;
}) {
	const { t } = useTranslation(["scrims"]);

	if (rows.length === 0) {
		return (
			<div className={styles.empty}>{t("scrims:mapByMap.stats.empty")}</div>
		);
	}

	return (
		<table className={styles.table}>
			<thead>
				<tr>
					<th>{t("scrims:mapByMap.stats.col.label")}</th>
					<th className={styles.cellRight}>
						{t("scrims:mapByMap.stats.col.wins")}
					</th>
					<th className={styles.cellRight}>
						{t("scrims:mapByMap.stats.col.losses")}
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.key}>
						<td>{row.label}</td>
						<td className={styles.cellRight}>{row.wins}</td>
						<td className={styles.cellRight}>{row.losses}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
