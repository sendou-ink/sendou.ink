import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSwitch } from "~/components/elements/Switch";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { ModeImage, StageImage } from "~/components/Image";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import type { loader } from "../loaders/scrims.$id.server";
import styles from "./ScrimMatchStatsTab.module.css";

type View = "MODE" | "STAGE" | "BOTH";

const VIEW_OPTIONS: View[] = ["MODE", "STAGE", "BOTH"];

export function ScrimMatchStatsTab() {
	const { t } = useTranslation(["scrims", "game-misc"]);
	const data = useLoaderData<typeof loader>();

	const viewerSide = data.mapByMap?.viewerSide;
	const maps = data.mapByMap?.maps ?? [];
	const ownPool = data.mapByMap?.ownPool
		? new MapPool(data.mapByMap.ownPool)
		: null;

	const [view, setView] = React.useState<View>("BOTH");
	const [restrictToPool, setRestrictToPool] = React.useState(Boolean(ownPool));

	if (!viewerSide || maps.length === 0) {
		return (
			<SendouTabPanel id={TAB_KEYS.STATS}>
				<div className={styles.empty}>{t("scrims:mapByMap.stats.empty")}</div>
			</SendouTabPanel>
		);
	}

	const restrictPool = restrictToPool && ownPool ? ownPool : undefined;

	const stats = ScrimMapByMap.stats(maps, viewerSide, {
		restrictToPool: restrictPool,
	});

	return (
		<SendouTabPanel id={TAB_KEYS.STATS}>
			<div className={styles.root} data-testid="scrim-stats-root">
				<div className={styles.controls}>
					<SendouChipRadioGroup>
						{VIEW_OPTIONS.map((option) => (
							<SendouChipRadio
								key={option}
								name="scrim-stats-view"
								value={option}
								checked={view === option}
								onChange={(value) => setView(value as View)}
							>
								{t(`scrims:mapByMap.stats.view.${option}` as const)}
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
					{ownPool ? (
						<label className={styles.toggleRow}>
							<SendouSwitch
								isSelected={restrictToPool}
								onChange={setRestrictToPool}
							/>
							{t("scrims:mapByMap.stats.restrictToPool")}
						</label>
					) : null}
				</div>

				{view === "MODE" ? (
					<StatsTable
						rows={stats.byMode.map((r) => ({
							key: r.key,
							label: (
								<span className={styles.stageModeLabel}>
									<ModeImage mode={r.key as ModeShort} size={20} />
									{t(`game-misc:MODE_LONG_${r.key as "SZ"}` as const, {
										defaultValue: r.key,
									})}
								</span>
							),
							wins: r.wins,
							losses: r.losses,
						}))}
					/>
				) : null}

				{view === "STAGE" ? (
					<StatsTable
						rows={stats.byStage.map((r) => {
							const stageId = Number(r.key);
							return {
								key: r.key,
								label: (
									<span className={styles.stageModeLabel}>
										<StageImage
											stageId={stageId as StageId}
											width={36}
											className={styles.stageImage}
										/>
										{t(`game-misc:STAGE_${stageId}` as const, {
											defaultValue: r.key,
										})}
									</span>
								),
								wins: r.wins,
								losses: r.losses,
							};
						})}
					/>
				) : null}

				{view === "BOTH" ? (
					<StatsTable
						rows={stats.byStageMode.map((r) => {
							const [stageId, mode] = r.key.split("-");
							const stageLabel = t(
								`game-misc:STAGE_${Number(stageId)}` as const,
								{ defaultValue: stageId },
							);
							return {
								key: r.key,
								label: (
									<span className={styles.stageModeLabel}>
										<ModeImage mode={mode as ModeShort} size={20} />
										<StageImage
											stageId={Number(stageId) as StageId}
											width={36}
											className={styles.stageImage}
										/>
										{stageLabel}
									</span>
								),
								wins: r.wins,
								losses: r.losses,
							};
						})}
					/>
				) : null}
			</div>
		</SendouTabPanel>
	);
}

function StatsTable({
	rows,
}: {
	rows: Array<{
		key: string;
		label: React.ReactNode;
		wins: number;
		losses: number;
	}>;
}) {
	const { t } = useTranslation(["scrims"]);

	if (rows.length === 0) {
		return (
			<div className={styles.empty}>{t("scrims:mapByMap.stats.empty")}</div>
		);
	}

	const sortedRows = [...rows]
		.map((row) => ({ ...row, winRate: row.wins / (row.wins + row.losses) }))
		.sort((a, b) => {
			if (b.winRate !== a.winRate) return b.winRate - a.winRate;
			return b.wins + b.losses - (a.wins + a.losses);
		});

	return (
		<table className={styles.table}>
			<thead>
				<tr>
					<th>{t("scrims:mapByMap.stats.col.label")}</th>
					<th className={styles.cellNum}>
						{t("scrims:mapByMap.stats.col.wins")}
					</th>
					<th className={styles.cellNum}>
						{t("scrims:mapByMap.stats.col.losses")}
					</th>
					<th className={styles.cellNum}>
						{t("scrims:mapByMap.stats.col.winPct")}
					</th>
				</tr>
			</thead>
			<tbody>
				{sortedRows.map((row) => (
					<tr key={row.key}>
						<td>{row.label}</td>
						<td className={styles.cellNum}>{row.wins}</td>
						<td className={styles.cellNum}>{row.losses}</td>
						<td className={styles.cellNum}>{Math.round(row.winRate * 100)}%</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
