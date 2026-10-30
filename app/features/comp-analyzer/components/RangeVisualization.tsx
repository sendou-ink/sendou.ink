import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SendouSwitch } from "~/components/elements/Switch";
import { SpecialWeaponImage, WeaponImage } from "~/components/Image";
import type { RangeVariantKey } from "~/features/build-analyzer/analyzer-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	useHiddenRanges,
	useRangeVariants,
	useSpecialRanges,
} from "../comp-analyzer-hooks";
import * as SpecialWeaponRange from "../core/SpecialWeaponRange";
import * as WeaponRange from "../core/WeaponRange";
import styles from "./RangeVisualization.module.css";

const SLOT_COLORS = ["#f5d742", "#f5b8d0", "#90e8a8", "#8cd4f5"] as const;

const BENCHMARK_COLORS = [
	"rgba(100, 100, 120, 0.5)",
	"rgba(100, 100, 120, 0.5)",
] as const;

const CHART_WIDTH = 600;
const CHART_HEIGHT = 240;
const CHART_PADDING = { top: 20, right: 60, bottom: 30, left: 50 };
const CHART_INNER_WIDTH =
	CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const MAX_RANGE = 32;

const ALTERNATE_VARIANT_DASH = "6,4";

interface RangeVisualizationProps {
	weaponIds: MainWeaponId[];
}

export function RangeVisualization({ weaponIds }: RangeVisualizationProps) {
	const { t } = useTranslation(["analyzer", "weapons"]);
	const [isCollapsed, setIsCollapsed] = useState(false);
	const { enabledVariantKeys, setEnabledVariantKeys } = useRangeVariants();
	const [showSpecialRanges, setShowSpecialRanges] = useSpecialRanges();
	const { hiddenWeaponIds, toggleHidden } = useHiddenRanges();

	const weaponsWithRange = WeaponRange.ofWeapons(weaponIds, enabledVariantKeys);
	const shownWeapons = weaponsWithRange.filter(
		(weapon) => !hiddenWeaponIds.includes(weapon.weaponId),
	);
	const benchmarkTrajectories = WeaponRange.benchmarkTrajectories();

	if (weaponsWithRange.length === 0) {
		return null;
	}

	const allYValues: number[] = [];
	for (const weapon of shownWeapons) {
		for (const variant of weapon.variants) {
			for (const point of variant.trajectory ?? []) {
				if (point.y >= 0) {
					allYValues.push(point.y);
				}
			}
		}
	}

	const handleToggleVariant = (
		weapon: WeaponRange.WeaponWithRange,
		key: RangeVariantKey,
	) => {
		const nextKeys = WeaponRange.toggleVariant(weapon, key);
		if (!nextKeys) return;

		setEnabledVariantKeys(weapon.weaponId, nextKeys);
	};

	return (
		<div className={styles.container} data-testid="range-visualization">
			<button
				type="button"
				className={styles.header}
				onClick={() => setIsCollapsed(!isCollapsed)}
				data-testid="range-toggle"
			>
				<span className={styles.headerTitle}>
					{t("analyzer:comp.weaponRanges")}
				</span>
				<span className={styles.collapseIcon}>{isCollapsed ? "+" : "-"}</span>
			</button>
			{!isCollapsed ? (
				<div className={styles.content}>
					<div className={styles.benchmarkLegend}>
						{WeaponRange.BENCHMARK_WEAPON_IDS.map((weaponId) => (
							<div key={weaponId} className={styles.legendItem}>
								<span className={styles.legendLine} />
								<span className={styles.legendLabel}>
									{t(`weapons:MAIN_${weaponId}`)}
								</span>
							</div>
						))}
					</div>
					<div className={styles.chartContainer}>
						<WeaponLegend
							weapons={weaponsWithRange}
							hiddenWeaponIds={hiddenWeaponIds}
							onToggleVariant={handleToggleVariant}
							onToggleHidden={toggleHidden}
						/>
						<TrajectoryChart
							weapons={shownWeapons}
							benchmarkTrajectories={benchmarkTrajectories}
							maxY={Math.max(...allYValues, 2)}
						/>
						<div className={styles.specialRangesToggleRow}>
							<SendouSwitch
								isSelected={showSpecialRanges}
								onChange={setShowSpecialRanges}
								data-testid="special-ranges-switch"
							>
								{t("analyzer:comp.specialRanges")}
							</SendouSwitch>
						</div>
						{showSpecialRanges ? (
							<SpecialRangeRows weaponIds={weaponIds} />
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

function WeaponLegend({
	weapons,
	hiddenWeaponIds,
	onToggleVariant,
	onToggleHidden,
}: {
	weapons: WeaponRange.WeaponWithRange[];
	hiddenWeaponIds: MainWeaponId[];
	onToggleVariant: (
		weapon: WeaponRange.WeaponWithRange,
		key: RangeVariantKey,
	) => void;
	onToggleHidden: (weaponId: MainWeaponId) => void;
}) {
	const { t } = useTranslation(["analyzer"]);

	return (
		<div className={styles.weaponLegend}>
			{weapons.map((weapon) => {
				const color = SLOT_COLORS[weapon.slot % SLOT_COLORS.length];
				const isHidden = hiddenWeaponIds.includes(weapon.weaponId);
				const visibilityToggle = (
					<VisibilityToggle
						weaponId={weapon.weaponId}
						isHidden={isHidden}
						onToggle={() => onToggleHidden(weapon.weaponId)}
					/>
				);

				if (weapon.allVariantKeys.length === 0) {
					const [variant] = weapon.variants;
					return (
						<div
							key={`${weapon.weaponId}-${weapon.slot}`}
							className={clsx(styles.weaponLegendItem, {
								[styles.weaponLegendItemHidden]: isHidden,
							})}
						>
							{visibilityToggle}
							<span
								className={styles.weaponLegendColor}
								style={{ backgroundColor: color }}
							/>
							<span className={styles.weaponLegendRange}>
								{variant.range.toFixed(1)}
							</span>
							<LethalRangeLabel lethal={variant.lethal} />
						</div>
					);
				}

				const allVariants = WeaponRange.variantsOf(weapon.weaponId);

				return (
					<div
						key={`${weapon.weaponId}-${weapon.slot}`}
						className={clsx(styles.weaponLegendItem, {
							[styles.weaponLegendItemHidden]: isHidden,
						})}
					>
						{visibilityToggle}
						{allVariants.map((variant) => {
							if (variant.key === null) return null;
							const key = variant.key;
							const isShown = weapon.variants.some(
								(shown) => shown.key === key,
							);

							return (
								<button
									key={key}
									type="button"
									className={clsx(styles.variantChip, {
										[styles.variantChipHidden]: !isShown,
									})}
									aria-pressed={isShown}
									disabled={isHidden}
									onClick={() => onToggleVariant(weapon, key)}
									data-testid={`range-variant-${key}`}
								>
									<VariantLineSample
										color={color}
										isDefault={variant.isDefault}
									/>
									<span>{t(`analyzer:comp.rangeVariant.${key}`)}</span>
									<span className={styles.weaponLegendRange}>
										{variant.range.toFixed(1)}
									</span>
									<LethalRangeLabel lethal={variant.lethal} />
								</button>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

function VisibilityToggle({
	weaponId,
	isHidden,
	onToggle,
}: {
	weaponId: MainWeaponId;
	isHidden: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation(["analyzer", "weapons"]);
	const weaponName = t(`weapons:MAIN_${weaponId}`);

	return (
		<button
			type="button"
			className={styles.visibilityToggle}
			aria-pressed={!isHidden}
			aria-label={
				isHidden
					? t("analyzer:comp.showInRangeChart", { weapon: weaponName })
					: t("analyzer:comp.hideFromRangeChart", { weapon: weaponName })
			}
			onClick={onToggle}
			data-testid={`range-visibility-${weaponId}`}
		>
			<WeaponImage weaponSplId={weaponId} variant="build" size={24} />
			{isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
		</button>
	);
}

function VariantLineSample({
	color,
	isDefault,
}: {
	color: string;
	isDefault: boolean;
}) {
	return (
		<svg width={16} height={4} aria-hidden className={styles.variantLine}>
			<line
				x1={0}
				y1={2}
				x2={16}
				y2={2}
				stroke={color}
				strokeWidth={3}
				strokeDasharray={isDefault ? undefined : "4,3"}
			/>
		</svg>
	);
}

function LethalRangeLabel({
	lethal,
}: {
	lethal: WeaponRange.LethalRange | undefined;
}) {
	const { t } = useTranslation(["analyzer"]);

	if (!lethal) return null;

	return (
		<span className={styles.lethalRange}>
			{t("analyzer:comp.lethalRange", {
				shots: lethal.shots,
				distance: lethal.distance.toFixed(1),
			})}
		</span>
	);
}

interface TrajectoryChartProps {
	weapons: WeaponRange.WeaponWithRange[];
	benchmarkTrajectories: WeaponRange.BenchmarkTrajectory[];
	maxY: number;
}

function TrajectoryChart({
	weapons,
	benchmarkTrajectories,
	maxY,
}: TrajectoryChartProps) {
	const minY = 0;
	const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

	const xScale = (z: number) => (z / MAX_RANGE) * CHART_INNER_WIDTH;
	const yScale = (y: number) =>
		innerHeight - ((y - minY) / (maxY - minY)) * innerHeight;

	const trajectoryToPath = (
		trajectory: WeaponRange.TrajectoryPoint[],
	): string => {
		const points = clampToGround(trajectory).map(
			(p) => `${xScale(p.z)},${yScale(p.y)}`,
		);
		if (points.length === 0) return "";

		return `M ${points.join(" L ")}`;
	};

	const groundY = yScale(0);

	const xTicks: number[] = [];
	const xStep = Math.ceil(MAX_RANGE / 5);
	for (let x = 0; x <= MAX_RANGE; x += xStep) {
		xTicks.push(x);
	}

	const yTicks: number[] = [];
	const yStep = Math.ceil((maxY - minY) / 4);
	for (let y = Math.ceil(minY); y <= maxY; y += yStep) {
		yTicks.push(y);
	}

	const shownVariants = weapons.flatMap((weapon) =>
		weapon.variants.map((variant) => ({
			id: `${weapon.weaponId}-${weapon.slot}-${variant.key}`,
			color: SLOT_COLORS[weapon.slot % SLOT_COLORS.length],
			variant,
		})),
	);

	return (
		<svg
			viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
			className={styles.chart}
			preserveAspectRatio="xMidYMid meet"
		>
			<g transform={`translate(${CHART_PADDING.left}, ${CHART_PADDING.top})`}>
				{xTicks.map((tick) => (
					<line
						key={`x-grid-${tick}`}
						x1={xScale(tick)}
						y1={0}
						x2={xScale(tick)}
						y2={innerHeight}
						stroke="var(--color-border)"
						strokeWidth={0.5}
					/>
				))}
				{yTicks.map((tick) => (
					<line
						key={`y-grid-${tick}`}
						x1={0}
						y1={yScale(tick)}
						x2={CHART_INNER_WIDTH}
						y2={yScale(tick)}
						stroke="var(--color-border)"
						strokeWidth={0.5}
					/>
				))}

				<line
					x1={0}
					y1={groundY}
					x2={CHART_INNER_WIDTH}
					y2={groundY}
					stroke="var(--color-text-high)"
					strokeWidth={1}
				/>

				{benchmarkTrajectories.map((benchmark, index) => {
					const x = xScale(benchmark.range);
					return (
						<line
							key={benchmark.id}
							x1={x}
							y1={0}
							x2={x}
							y2={innerHeight}
							stroke={BENCHMARK_COLORS[index % BENCHMARK_COLORS.length]}
							strokeWidth={2}
							strokeDasharray="4,4"
						/>
					);
				})}

				{shownVariants.map(({ id, color, variant }) => {
					if (!variant.trajectory) return null;
					return (
						<path
							key={id}
							d={trajectoryToPath(variant.trajectory)}
							fill="none"
							stroke={color}
							strokeWidth={2.5}
							strokeDasharray={
								variant.isDefault ? undefined : ALTERNATE_VARIANT_DASH
							}
						/>
					);
				})}

				{shownVariants.map(({ id, color, variant }) => {
					if (!variant.blastRadius || !variant.trajectory) return null;
					const blastPoint = clampToGround(variant.trajectory).at(-1);
					if (!blastPoint) return null;
					return (
						<circle
							key={`blast-${id}`}
							cx={xScale(blastPoint.z)}
							cy={yScale(blastPoint.y)}
							r={xScale(variant.blastRadius)}
							fill={`${color}33`}
							stroke={color}
							strokeWidth={1}
							strokeDasharray={
								variant.isDefault ? undefined : ALTERNATE_VARIANT_DASH
							}
						/>
					);
				})}

				{shownVariants.map(({ id, color, variant }) => {
					if (!variant.lethal || !variant.trajectory) return null;
					const markerY = heightAt(variant.trajectory, variant.lethal.distance);
					if (markerY === null) return null;
					return (
						<circle
							key={`lethal-${id}`}
							cx={xScale(variant.lethal.distance)}
							cy={yScale(markerY)}
							r={4}
							fill={color}
							stroke="var(--color-bg)"
							strokeWidth={1.5}
							data-testid="lethal-range-marker"
						/>
					);
				})}

				{xTicks.map((tick) => (
					<text
						key={`x-label-${tick}`}
						x={xScale(tick)}
						y={innerHeight + 15}
						textAnchor="middle"
						fontSize={10}
						fill="var(--color-text-high)"
					>
						{tick}
					</text>
				))}

				{yTicks.map((tick) => (
					<text
						key={`y-label-${tick}`}
						x={-8}
						y={yScale(tick) + 3}
						textAnchor="end"
						fontSize={10}
						fill="var(--color-text-high)"
					>
						{tick}
					</text>
				))}

				<text
					x={CHART_INNER_WIDTH / 2}
					y={innerHeight + 25}
					textAnchor="middle"
					fontSize={11}
					fill="var(--color-text-high)"
				>
					z
				</text>
				<text
					x={-25}
					y={innerHeight / 2}
					textAnchor="middle"
					fontSize={11}
					fill="var(--color-text-high)"
					transform={`rotate(-90, -25, ${innerHeight / 2})`}
				>
					y
				</text>
			</g>
		</svg>
	);
}

/** Special ranges of the comp as bars on the same x scale as the trajectory chart above them */
function SpecialRangeRows({ weaponIds }: { weaponIds: MainWeaponId[] }) {
	const rows = SpecialWeaponRange.ofWeapons(weaponIds);

	if (rows.length === 0) return null;

	const trackStyle = {
		marginInlineStart: `${(CHART_PADDING.left / CHART_WIDTH) * 100}%`,
		width: `${(CHART_INNER_WIDTH / CHART_WIDTH) * 100}%`,
	};
	const percentageOfTrack = (distance: number) =>
		`${(Math.min(distance, MAX_RANGE) / MAX_RANGE) * 100}%`;

	return (
		<div className={styles.specialRanges} data-testid="special-ranges">
			{rows.map((row) => {
				const color = SLOT_COLORS[row.slot % SLOT_COLORS.length];
				return (
					<div key={row.slot} className={styles.specialRangeRow}>
						<SpecialWeaponImage
							specialWeaponId={row.specialWeaponId}
							size={24}
							className={styles.specialRangeIcon}
						/>
						<div className={styles.specialRangeTrack} style={trackStyle}>
							<span
								className={styles.specialRangeBar}
								style={{
									width: percentageOfTrack(row.range),
									backgroundColor: color,
								}}
							>
								{row.range.toFixed(1)}
								{row.blastRadius ? ` + ${row.blastRadius.toFixed(1)}` : ""}
							</span>
							{row.blastRadius ? (
								<span
									className={styles.specialRangeBlast}
									style={{
										insetInlineStart: percentageOfTrack(row.range),
										width: percentageOfTrack(row.blastRadius),
										backgroundColor: color,
									}}
								/>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/** The trajectory up to where it reaches the ground (or its last point mid-air) */
function clampToGround(
	trajectory: WeaponRange.TrajectoryPoint[],
): WeaponRange.TrajectoryPoint[] {
	const clampedPoints: WeaponRange.TrajectoryPoint[] = [];
	for (const point of trajectory) {
		if (point.y >= 0) {
			clampedPoints.push(point);
			continue;
		}

		const prevPoint = clampedPoints.at(-1);
		if (prevPoint && prevPoint.y > 0) {
			const t = prevPoint.y / (prevPoint.y - point.y);
			clampedPoints.push({
				z: prevPoint.z + t * (point.z - prevPoint.z),
				y: 0,
			});
		}
		break;
	}

	return clampedPoints;
}

function heightAt(
	trajectory: WeaponRange.TrajectoryPoint[],
	z: number,
): number | null {
	const points = clampToGround(trajectory);
	for (let i = 1; i < points.length; i++) {
		const prevPoint = points[i - 1];
		const point = points[i];
		if (z < prevPoint.z || z > point.z) continue;

		const t =
			point.z === prevPoint.z ? 0 : (z - prevPoint.z) / (point.z - prevPoint.z);
		return prevPoint.y + t * (point.y - prevPoint.y);
	}

	return null;
}
