import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	BENCHMARK_WEAPON_IDS,
	getBenchmarkTrajectories,
	getWeaponsWithRange,
	type TrajectoryPoint,
	type WeaponWithRange,
} from "../core/weapon-range";
import styles from "./RangeVisualization.module.css";

const SLOT_COLORS = ["#f5d742", "#f5b8d0", "#90e8a8", "#8cd4f5"] as const;

const BENCHMARK_COLORS = [
	"rgba(100, 100, 120, 0.5)",
	"rgba(100, 100, 120, 0.5)",
] as const;

interface RangeVisualizationProps {
	weaponIds: MainWeaponId[];
}

export function RangeVisualization({ weaponIds }: RangeVisualizationProps) {
	const { t } = useTranslation(["analyzer", "weapons"]);
	const [isCollapsed, setIsCollapsed] = useState(false);

	const weaponsWithRange = getWeaponsWithRange(weaponIds);
	const benchmarkTrajectories = getBenchmarkTrajectories();

	if (weaponsWithRange.length === 0) {
		return null;
	}

	const maxRange = 32;

	const allYValues: number[] = [];
	for (const weapon of weaponsWithRange) {
		if (weapon.trajectory) {
			for (const point of weapon.trajectory) {
				if (point.y >= 0) {
					allYValues.push(point.y);
				}
			}
		}
	}

	const minY = 0;
	const maxY = Math.max(...allYValues, 2);

	return (
		<div className={styles.container}>
			<button
				type="button"
				className={styles.header}
				onClick={() => setIsCollapsed(!isCollapsed)}
			>
				<span className={styles.headerTitle}>
					{t("analyzer:comp.weaponRanges")}
				</span>
				<span className={styles.collapseIcon}>{isCollapsed ? "+" : "-"}</span>
			</button>
			{!isCollapsed ? (
				<div className={styles.content}>
					<div className={styles.benchmarkLegend}>
						{BENCHMARK_WEAPON_IDS.map((weaponId) => (
							<div key={weaponId} className={styles.legendItem}>
								<span className={styles.legendLine} />
								<span className={styles.legendLabel}>
									{t(`weapons:MAIN_${weaponId}`)}
								</span>
							</div>
						))}
					</div>
					<TrajectoryChart
						weapons={weaponsWithRange}
						benchmarkTrajectories={benchmarkTrajectories}
						maxRange={maxRange}
						minY={minY}
						maxY={maxY}
						weaponIds={weaponIds}
					/>
				</div>
			) : null}
		</div>
	);
}

interface TrajectoryChartProps {
	weapons: WeaponWithRange[];
	benchmarkTrajectories: Array<{
		id: MainWeaponId;
		range: number;
		trajectory?: TrajectoryPoint[];
	}>;
	maxRange: number;
	minY: number;
	maxY: number;
	weaponIds: MainWeaponId[];
}

function TrajectoryChart({
	weapons,
	benchmarkTrajectories,
	maxRange,
	minY,
	maxY,
	weaponIds,
}: TrajectoryChartProps) {
	const chartWidth = 600;
	const chartHeight = 200;
	const padding = { top: 20, right: 60, bottom: 30, left: 50 };
	const innerWidth = chartWidth - padding.left - padding.right;
	const innerHeight = chartHeight - padding.top - padding.bottom;

	const xScale = (z: number) => (z / maxRange) * innerWidth;
	const yScale = (y: number) =>
		innerHeight - ((y - minY) / (maxY - minY)) * innerHeight;

	// Returns the point where trajectory hits y=0 (ground level).
	// This differs from lastPoint which may be below ground or mid-air.
	// Used for blast radius positioning since explosions happen at ground impact.
	const getGroundIntersection = (
		trajectory: TrajectoryPoint[],
	): TrajectoryPoint | null => {
		for (let i = 0; i < trajectory.length; i++) {
			const point = trajectory[i];
			if (point.y < 0) {
				const prevPoint = trajectory[i - 1];
				if (prevPoint && prevPoint.y >= 0) {
					const t = prevPoint.y / (prevPoint.y - point.y);
					const groundZ = prevPoint.z + t * (point.z - prevPoint.z);
					return { z: groundZ, y: 0 };
				}
				break;
			}
		}
		const lastPoint = trajectory[trajectory.length - 1];
		return lastPoint && lastPoint.y >= 0 ? lastPoint : null;
	};

	const trajectoryToPath = (trajectory: TrajectoryPoint[]): string => {
		if (trajectory.length === 0) return "";

		const clampedPoints: TrajectoryPoint[] = [];
		for (const point of trajectory) {
			if (point.y >= 0) {
				clampedPoints.push(point);
			} else {
				const prevPoint = clampedPoints[clampedPoints.length - 1];
				if (prevPoint && prevPoint.y > 0) {
					const t = prevPoint.y / (prevPoint.y - point.y);
					const groundZ = prevPoint.z + t * (point.z - prevPoint.z);
					clampedPoints.push({ z: groundZ, y: 0 });
				}
				break;
			}
		}

		if (clampedPoints.length === 0) return "";

		const points = clampedPoints.map((p) => `${xScale(p.z)},${yScale(p.y)}`);
		return `M ${points.join(" L ")}`;
	};

	const groundY = yScale(0);

	const xTicks = [];
	const xStep = Math.ceil(maxRange / 5);
	for (let x = 0; x <= maxRange; x += xStep) {
		xTicks.push(x);
	}

	const yTicks = [];
	const yStep = Math.ceil((maxY - minY) / 4);
	for (let y = Math.ceil(minY); y <= maxY; y += yStep) {
		yTicks.push(y);
	}

	return (
		<div className={styles.chartContainer}>
			<div className={styles.weaponLegend}>
				{weapons.map((weapon, index) => {
					const slotIndex = weaponIds.indexOf(weapon.weaponId);
					const color = SLOT_COLORS[slotIndex % SLOT_COLORS.length];
					return (
						<div
							key={`${weapon.weaponId}-${index}`}
							className={styles.weaponLegendItem}
						>
							<WeaponImage
								weaponSplId={weapon.weaponId}
								variant="build"
								size={24}
							/>
							<span
								className={styles.weaponLegendColor}
								style={{ backgroundColor: color }}
							/>
							<span className={styles.weaponLegendRange}>
								{weapon.range.toFixed(1)}
							</span>
						</div>
					);
				})}
			</div>
			<svg
				viewBox={`0 0 ${chartWidth} ${chartHeight}`}
				className={styles.chart}
				preserveAspectRatio="xMidYMid meet"
			>
				<g transform={`translate(${padding.left}, ${padding.top})`}>
					{/* Grid lines */}
					{xTicks.map((tick) => (
						<line
							key={`x-grid-${tick}`}
							x1={xScale(tick)}
							y1={0}
							x2={xScale(tick)}
							y2={innerHeight}
							stroke="var(--border)"
							strokeWidth={0.5}
						/>
					))}
					{yTicks.map((tick) => (
						<line
							key={`y-grid-${tick}`}
							x1={0}
							y1={yScale(tick)}
							x2={innerWidth}
							y2={yScale(tick)}
							stroke="var(--border)"
							strokeWidth={0.5}
						/>
					))}

					{/* Ground line (y=0) */}
					<line
						x1={0}
						y1={groundY}
						x2={innerWidth}
						y2={groundY}
						stroke="var(--text-lighter)"
						strokeWidth={1}
					/>

					{/* Benchmark vertical lines */}
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

					{/* Weapon trajectories */}
					{weapons.map((weapon, index) => {
						if (!weapon.trajectory) return null;
						const slotIndex = weaponIds.indexOf(weapon.weaponId);
						const color = SLOT_COLORS[slotIndex % SLOT_COLORS.length];
						return (
							<path
								key={`${weapon.weaponId}-${index}`}
								d={trajectoryToPath(weapon.trajectory)}
								fill="none"
								stroke={color}
								strokeWidth={2.5}
							/>
						);
					})}

					{/* Blast radius circles */}
					{weapons.map((weapon, index) => {
						if (!weapon.blastRadius || !weapon.trajectory) return null;
						const groundPoint = getGroundIntersection(weapon.trajectory);
						if (!groundPoint) return null;
						const slotIndex = weaponIds.indexOf(weapon.weaponId);
						const color = SLOT_COLORS[slotIndex % SLOT_COLORS.length];
						const radiusPixels = xScale(weapon.blastRadius);
						return (
							<circle
								key={`blast-${weapon.weaponId}-${index}`}
								cx={xScale(groundPoint.z)}
								cy={yScale(0)}
								r={radiusPixels}
								fill={`${color}33`}
								stroke={color}
								strokeWidth={1}
							/>
						);
					})}

					{/* X axis labels */}
					{xTicks.map((tick) => (
						<text
							key={`x-label-${tick}`}
							x={xScale(tick)}
							y={innerHeight + 15}
							textAnchor="middle"
							fontSize={10}
							fill="var(--text-lighter)"
						>
							{tick}
						</text>
					))}

					{/* Y axis labels */}
					{yTicks.map((tick) => (
						<text
							key={`y-label-${tick}`}
							x={-8}
							y={yScale(tick) + 3}
							textAnchor="end"
							fontSize={10}
							fill="var(--text-lighter)"
						>
							{tick}
						</text>
					))}

					{/* Axis labels */}
					<text
						x={innerWidth / 2}
						y={innerHeight + 25}
						textAnchor="middle"
						fontSize={11}
						fill="var(--text-lighter)"
					>
						z
					</text>
					<text
						x={-25}
						y={innerHeight / 2}
						textAnchor="middle"
						fontSize={11}
						fill="var(--text-lighter)"
						transform={`rotate(-90, -25, ${innerHeight / 2})`}
					>
						y
					</text>
				</g>
			</svg>
		</div>
	);
}
