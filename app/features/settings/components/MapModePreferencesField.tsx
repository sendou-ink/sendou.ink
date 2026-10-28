import clsx from "clsx";
import { Check, ChevronRight } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { ModeImage } from "~/components/Image";
import type { Preference, UserMapModePreferences } from "~/db/tables-json";
import {
	BANNED_MAPS,
	SENDOUQ_MAP_POOL,
} from "~/features/match-profile/banned-maps";
import * as MapWinRates from "~/features/match-profile/core/MapWinRates";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/match-profile/match-profile-constants";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { stageImageUrl } from "~/utils/urls";
import styles from "./MapModePreferencesField.module.css";

const PREFERENCE_OPTIONS = ["AVOID", "NEUTRAL", "PREFER"] as const;
const PREFERENCE_LABEL_KEYS = {
	AVOID: "settings:matchProfile.maps.avoid",
	NEUTRAL: "settings:matchProfile.maps.neutral",
	PREFER: "settings:matchProfile.maps.prefer",
} as const;
const SORT_ORDERS: MapWinRates.SortOrder[] = ["DEFAULT", "BEST", "WORST"];

type PreferenceOption = (typeof PREFERENCE_OPTIONS)[number];

export function preferencesFromRaw(
	raw: UserMapModePreferences | null | undefined,
): UserMapModePreferences {
	if (!raw) return { pool: [], modes: [] };

	return {
		modes: raw.modes,
		pool: raw.pool.map((p) => ({
			mode: p.mode,
			stages: p.stages.filter((s) => !BANNED_MAPS[p.mode].includes(s)),
		})),
	};
}

/** Mode preferences and the map pool of each mode. With `mapResults` the win rate of every mode and map is shown alongside. */
export function MapModePreferencesField({
	value,
	onChange,
	mapResults,
}: {
	value: UserMapModePreferences;
	onChange: (value: UserMapModePreferences) => void;
	mapResults?: MapWinRates.MapResult[];
}) {
	const { t } = useTranslation(["common", "settings"]);
	const [selectedMode, setSelectedMode] = React.useState<ModeShort>(
		modesShort[0],
	);

	const handleModePreferenceChange = (
		mode: ModeShort,
		preference: PreferenceOption,
	) => {
		const newModePreferences = value.modes.filter((mp) => mp.mode !== mode);
		if (preference !== "NEUTRAL") {
			newModePreferences.push({ mode, preference });
		}
		onChange({ modes: newModePreferences, pool: value.pool });
	};

	const handlePoolChange = (mode: ModeShort, stages: StageId[]) => {
		const filtered = value.pool.filter((p) => p.mode !== mode);
		filtered.push({ mode, stages });
		onChange({ ...value, pool: filtered });
	};

	const modePreference = (mode: ModeShort): Preference | undefined =>
		value.modes.find((mp) => mp.mode === mode)?.preference;
	const poolOf = (mode: ModeShort) =>
		value.pool.find((p) => p.mode === mode)?.stages ?? [];

	const pickableModes = modesShort.filter(
		(mode) => modePreference(mode) !== "AVOID",
	);
	const activeMode = pickableModes.includes(selectedMode)
		? selectedMode
		: pickableModes[0];

	return (
		<div className="stack md">
			{mapResults ? (
				<p className="text-xs text-lighter">
					{t("settings:matchProfile.maps.winRatesExplanation")}
				</p>
			) : null}
			<section className={styles.section}>
				<h3 className={styles.heading}>
					{t("settings:matchProfile.maps.modes")}
				</h3>
				{modesShort.map((mode) => (
					<ModePreferenceRow
						key={mode}
						mode={mode}
						preference={modePreference(mode) ?? "NEUTRAL"}
						onPreferenceChange={(preference) =>
							handleModePreferenceChange(mode, preference)
						}
						mapResults={mapResults}
					/>
				))}
			</section>
			{activeMode ? (
				<MapPoolSection
					mode={activeMode}
					modeTabs={pickableModes}
					onModeChange={setSelectedMode}
					poolOf={poolOf}
					onPoolChange={(stages) => handlePoolChange(activeMode, stages)}
					mapResults={mapResults}
				/>
			) : null}
		</div>
	);
}

function ModePreferenceRow({
	mode,
	preference,
	onPreferenceChange,
	mapResults,
}: {
	mode: ModeShort;
	preference: PreferenceOption;
	onPreferenceChange: (preference: PreferenceOption) => void;
	mapResults?: MapWinRates.MapResult[];
}) {
	const { t } = useTranslation(["settings", "game-misc"]);
	const modeRecord = mapResults
		? MapWinRates.record(mapResults, { mode })
		: null;

	return (
		<div
			className={clsx(styles.modeRow, {
				[styles.modeRowWithoutStats]: !modeRecord,
			})}
			data-testid={`mode-preference-row-${mode}`}
		>
			<ModeImage mode={mode} size={32} />
			<div className={styles.modeName}>
				<span>{t(`game-misc:MODE_LONG_${mode}`)}</span>
				{modeRecord ? (
					<span className={styles.record}>
						{modeRecord.wins}–{modeRecord.losses}
					</span>
				) : null}
			</div>
			{modeRecord ? (
				<WinRate winLoss={modeRecord} className={styles.modeWinRate} />
			) : null}
			<SendouChipRadioGroup
				aria-label={`Select preference towards ${mode}`}
				className={styles.preferenceChips}
			>
				{PREFERENCE_OPTIONS.map((option) => (
					<SendouChipRadio
						key={option}
						name={`mode-preference-${mode}`}
						value={option}
						checked={preference === option}
						onChange={() => onPreferenceChange(option)}
					>
						{t(PREFERENCE_LABEL_KEYS[option])}
					</SendouChipRadio>
				))}
			</SendouChipRadioGroup>
		</div>
	);
}

function MapPoolSection({
	mode,
	modeTabs,
	onModeChange,
	poolOf,
	onPoolChange,
	mapResults,
}: {
	mode: ModeShort;
	modeTabs: ModeShort[];
	onModeChange: (mode: ModeShort) => void;
	poolOf: (mode: ModeShort) => StageId[];
	onPoolChange: (stages: StageId[]) => void;
	mapResults?: MapWinRates.MapResult[];
}) {
	const { t } = useTranslation(["common", "settings", "game-misc"]);
	const [sortOrder, setSortOrder] =
		React.useState<MapWinRates.SortOrder>("DEFAULT");
	const [wigglingStageId, setWigglingStageId] = React.useState<StageId | null>(
		null,
	);

	const pool = poolOf(mode);
	const poolIsFull = pool.length >= AMOUNT_OF_MAPS_IN_POOL_PER_MODE;
	const allowedStages = SENDOUQ_MAP_POOL.parsed[mode];
	const sortedStages = MapWinRates.sortStages({
		stageIds: allowedStages,
		results: mapResults ?? [],
		mode,
		order: mapResults ? sortOrder : "DEFAULT",
	});

	const handleStageClick = (stageId: StageId) => {
		if (pool.includes(stageId)) {
			onPoolChange(pool.filter((s) => s !== stageId));
			return;
		}

		if (poolIsFull) {
			setWigglingStageId(stageId);
			return;
		}

		onPoolChange([...pool, stageId].sort((a, b) => a - b));
	};

	return (
		<section className={styles.section}>
			<div className={styles.poolHeader}>
				<h3 className={styles.heading}>{t("common:maps.mapPool")}</h3>
				{mapResults ? (
					<div className={styles.sort}>
						<span className="text-xs text-lighter" aria-hidden>
							{t("settings:matchProfile.maps.sort")}
						</span>
						<SendouChipRadioGroup
							aria-label={t("settings:matchProfile.maps.sort")}
						>
							{SORT_ORDERS.map((order) => (
								<SendouChipRadio
									key={order}
									name="map-pool-sort"
									value={order}
									checked={sortOrder === order}
									onChange={() => setSortOrder(order)}
								>
									{t(`settings:matchProfile.maps.sortOrder.${order}`)}
								</SendouChipRadio>
							))}
						</SendouChipRadioGroup>
					</div>
				) : null}
			</div>

			<div className={styles.modeTabs}>
				{modeTabs.map((tabMode) => {
					const active = tabMode === mode;

					return (
						<button
							key={tabMode}
							type="button"
							className={clsx(styles.modeTab, {
								[styles.modeTabActive]: active,
							})}
							onClick={() => onModeChange(tabMode)}
							aria-pressed={active}
							data-testid={`map-pool-mode-tab-${tabMode}`}
						>
							<ModeImage mode={tabMode} size={24} />
							<span className={styles.modeTabCount}>
								{poolOf(tabMode).length}/{AMOUNT_OF_MAPS_IN_POOL_PER_MODE}
							</span>
						</button>
					);
				})}
			</div>

			<div className={styles.slots}>
				<div className={styles.slotList}>
					{Array.from(
						{ length: AMOUNT_OF_MAPS_IN_POOL_PER_MODE },
						(_, index) => {
							const stageId = pool.at(index);

							if (stageId === undefined) {
								return (
									<span key={index} className={styles.emptySlot}>
										{index + 1}
									</span>
								);
							}

							return (
								<button
									key={index}
									type="button"
									className={styles.filledSlot}
									onClick={() => handleStageClick(stageId)}
									aria-label={`Remove ${t(`game-misc:STAGE_${stageId}`)}`}
								>
									<img src={`${stageImageUrl(stageId)}.avif`} alt="" />
								</button>
							);
						},
					)}
				</div>
				<span className="text-xs text-lighter">
					{poolIsFull
						? t("settings:matchProfile.maps.poolFull")
						: t("settings:matchProfile.maps.pickUpTo", {
								count: AMOUNT_OF_MAPS_IN_POOL_PER_MODE - pool.length,
							})}
				</span>
			</div>

			<div className={styles.mapGrid}>
				{sortedStages.map((stageId, index) => (
					<MapCard
						key={stageId}
						mode={mode}
						stageId={stageId}
						rank={mapResults && sortOrder !== "DEFAULT" ? index + 1 : undefined}
						picked={pool.includes(stageId)}
						locked={poolIsFull && !pool.includes(stageId)}
						wiggle={wigglingStageId === stageId}
						onWiggleEnd={() => setWigglingStageId(null)}
						onClick={() => handleStageClick(stageId)}
						mapResults={mapResults}
					/>
				))}
			</div>

			{BANNED_MAPS[mode].length > 0 ? (
				<details className={styles.banned}>
					<summary>
						<ChevronRight className={styles.bannedChevron} />
						{t("settings:matchProfile.maps.bannedCount", {
							count: BANNED_MAPS[mode].length,
						})}
					</summary>
					<div className={styles.bannedList}>
						{BANNED_MAPS[mode]
							.toSorted((a, b) => a - b)
							.map((stageId) => (
								<span key={stageId} className={styles.bannedMap}>
									<img src={`${stageImageUrl(stageId)}.avif`} alt="" />
									{t(`game-misc:STAGE_${stageId}`)}
								</span>
							))}
					</div>
				</details>
			) : null}
		</section>
	);
}

function MapCard({
	mode,
	stageId,
	rank,
	picked,
	locked,
	wiggle,
	onWiggleEnd,
	onClick,
	mapResults,
}: {
	mode: ModeShort;
	stageId: StageId;
	rank?: number;
	picked: boolean;
	locked: boolean;
	wiggle: boolean;
	onWiggleEnd: () => void;
	onClick: () => void;
	mapResults?: MapWinRates.MapResult[];
}) {
	const { t } = useTranslation(["settings", "game-misc"]);
	const stageRecord = mapResults
		? MapWinRates.record(mapResults, { mode, stageId })
		: null;
	const hasMaps = stageRecord ? MapWinRates.rate(stageRecord) !== null : false;

	return (
		<button
			type="button"
			className={clsx(styles.mapCard, {
				[styles.mapCardPicked]: picked,
				[styles.mapCardLocked]: locked,
				[styles.mapCardWiggle]: wiggle,
			})}
			onClick={onClick}
			onAnimationEnd={wiggle ? onWiggleEnd : undefined}
			aria-pressed={picked}
			data-testid={`map-pool-${mode}-${stageId}`}
		>
			<span className={styles.mapCardImage}>
				<img src={`${stageImageUrl(stageId)}.avif`} alt="" loading="lazy" />
				{picked ? (
					<span className={styles.mapCardCheck}>
						<Check />
					</span>
				) : null}
				{rank && hasMaps ? (
					<span className={styles.mapCardRank}>#{rank}</span>
				) : null}
			</span>
			<span className={styles.mapCardBody}>
				<span className={styles.mapCardName}>
					{t(`game-misc:STAGE_${stageId}`)}
				</span>
				{stageRecord ? (
					<>
						<span className={styles.mapCardRecord}>
							<WinRatePercentage winLoss={stageRecord} />
							<span className={styles.record}>
								{hasMaps
									? `${stageRecord.wins}–${stageRecord.losses}`
									: t("settings:matchProfile.maps.noMaps")}
							</span>
						</span>
						<WinRateBar winLoss={stageRecord} />
					</>
				) : null}
			</span>
		</button>
	);
}

function WinRate({
	winLoss,
	className,
}: {
	winLoss: MapWinRates.WinLoss;
	className?: string;
}) {
	return (
		<span className={clsx(styles.winRate, className)}>
			<WinRatePercentage winLoss={winLoss} />
			<WinRateBar winLoss={winLoss} />
		</span>
	);
}

function WinRatePercentage({ winLoss }: { winLoss: MapWinRates.WinLoss }) {
	const winRate = MapWinRates.rate(winLoss);

	return (
		<span
			className={clsx(styles.percentage, {
				[styles.percentageWinning]:
					winRate !== null &&
					winRate >= 0.5 &&
					!MapWinRates.isLowSample(winLoss),
				[styles.percentageLosing]:
					winRate !== null &&
					winRate < 0.5 &&
					!MapWinRates.isLowSample(winLoss),
			})}
		>
			{winRate === null ? "—" : `${Math.round(winRate * 100)}%`}
		</span>
	);
}

function WinRateBar({ winLoss }: { winLoss: MapWinRates.WinLoss }) {
	const winRate = MapWinRates.rate(winLoss);
	const segment = winRate === null ? null : MapWinRates.barSegment(winRate);

	return (
		<span className={styles.bar} aria-hidden>
			{segment ? (
				<span
					className={clsx(styles.barFill, {
						[styles.barFillLosing]: winRate !== null && winRate < 0.5,
					})}
					style={{
						left: `${segment.startPercent}%`,
						width: `${segment.widthPercent}%`,
					}}
				/>
			) : null}
			<span className={styles.barCenter} />
		</span>
	);
}
