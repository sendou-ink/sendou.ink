import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { MAX_AP } from "~/constants";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { SendouButton } from "../../../components/elements/Button";
import { SendouPopover } from "../../../components/elements/Popover";
import type { FullInkTankOption } from "../analyzer-types";
import { fullInkTankOptions } from "../core/stats";
import { weaponParams } from "../core/utils";

interface PerInkTankGridProps {
	weaponSplId: MainWeaponId;
}

export function PerInkTankGrid(props: PerInkTankGridProps) {
	const { t } = useTranslation(["analyzer"]);

	return (
		<SendouPopover
			popoverClassName="analyzer__ink-grid__container"
			trigger={
				<SendouButton variant="minimal" size="small">
					{t("analyzer:button.showConsumptionGrid")}
				</SendouButton>
			}
		>
			<Grid {...props} />
		</SendouPopover>
	);
}

// if adding to this, also update analyzer.css
const AP_VALUES_TO_SHOW = [
	0, 3, 6, 9, 10, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
	29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 44, 45, 47, 48, 51, 54,
	57,
];

function Grid({ weaponSplId }: PerInkTankGridProps) {
	const { t } = useTranslation(["weapons", "analyzer"]);
	const [subsUsed, setSubsUsed] = React.useState(1);
	const [ismHovered, setIsmHovered] = React.useState<number>();
	const [issHovered, setIssHovered] = React.useState<number>();

	const values = React.useMemo(
		() => calculateGrid({ weaponSplId, subsUsed }),
		[weaponSplId, subsUsed],
	);

	const handleHover = ({ ismAP, issAP }: { ismAP: number; issAP: number }) => {
		setIsmHovered(ismAP);
		setIssHovered(issAP);
	};

	const handleMouseLeaveGrid = () => {
		setIsmHovered(undefined);
		setIssHovered(undefined);
	};

	return (
		<div>
			<h2 className="text-lg text-center">
				{t("analyzer:perInkTankGrid.header", {
					weapon: t(`weapons:MAIN_${weaponSplId}`),
					count: subsUsed,
				})}
			</h2>
			<div className="stack horizontal md justify-center my-2">
				{[0, 1, 2].map((subsUsedOption) => {
					const id = String(subsUsedOption);
					return (
						<div
							key={subsUsedOption}
							className="stack horizontal xs items-center"
						>
							<input
								type="radio"
								id={id}
								name="subsUsed"
								value={subsUsedOption}
								checked={subsUsedOption === subsUsed}
								onChange={(e) => setSubsUsed(Number(e.target.value))}
							/>
							<label htmlFor={id} className="mb-0">
								{subsUsedOption}
							</label>
						</div>
					);
				})}
			</div>
			<div className="stack horizontal sm" onMouseLeave={handleMouseLeaveGrid}>
				<div className="analyzer__ink-grid__horizontal-ability">
					<Ability ability="ISS" size="SUBTINY" />
				</div>
				<div className="analyzer__ink-grid">
					<div className="analyzer__ink-grid__horizontal-ability">
						<Ability ability="ISM" size="SUBTINY" />
					</div>
					<div />
					{AP_VALUES_TO_SHOW.map((ap) => (
						<div
							className={clsx("analyzer__ink-grid__ap", {
								"analyzer__ink-grid__ap__focused": ismHovered === ap,
							})}
							key={ap}
						>
							{ap}
						</div>
					))}
					{values.map((row, i) =>
						[
							<div
								className={clsx("analyzer__ink-grid__ap", {
									"analyzer__ink-grid__ap__focused":
										issHovered === AP_VALUES_TO_SHOW[i],
								})}
								key={i}
							>
								{AP_VALUES_TO_SHOW[i]}
							</div>,
						].concat(
							row.map((cell, j) => {
								const key = `${i}-${j}`;

								if (cell === "N/A") {
									return <div className="analyzer__ink-grid__cell" key={key} />;
								}

								const title = `${cell.shots ?? "-"} (ISM: ${cell.ismAP}, ISS: ${
									cell.issAP
								})`;

								if (typeof cell.shots !== "number") {
									return (
										<div
											className="analyzer__ink-grid__cell"
											key={key}
											style={{ "--cell-color": "var(--bg-lighter)" }}
											title={title}
											onMouseEnter={() =>
												handleHover({ ismAP: cell.ismAP, issAP: cell.issAP })
											}
										>
											-
										</div>
									);
								}

								return (
									<div
										key={key}
										className="analyzer__ink-grid__cell"
										style={{ "--cell-color": cell.hex }}
										title={title}
										onMouseEnter={() =>
											handleHover({ ismAP: cell.ismAP, issAP: cell.issAP })
										}
									>
										{cell.shots}
									</div>
								);
							}),
						),
					)}
				</div>
			</div>
		</div>
	);
}

type ShotCellData = { shots: number | null; ismAP: number; issAP: number };

// LDE boosts both ISM and ISS by max 18 AP each, but you need 10 AP to wear it.
const MAX_LDE_AP = 18 * 2;
const AP_NEEDED_TO_WEAR_LDE = 10;
const apsArePossible = (issAP: number, ismAP: number) =>
	issAP + ismAP - MAX_LDE_AP + AP_NEEDED_TO_WEAR_LDE <= MAX_AP;
function calculateGrid({
	weaponSplId,
	subsUsed,
}: {
	weaponSplId: MainWeaponId;
	subsUsed: number;
}) {
	const result: ("N/A" | ShotCellData)[][] = [];
	for (
		let issAPIndex = 0;
		issAPIndex < AP_VALUES_TO_SHOW.length;
		issAPIndex++
	) {
		const issAP = AP_VALUES_TO_SHOW[issAPIndex];

		const row: ("N/A" | ShotCellData)[] = [];
		for (
			let ismAPIndex = 0;
			ismAPIndex < AP_VALUES_TO_SHOW.length;
			ismAPIndex++
		) {
			const ismAP = AP_VALUES_TO_SHOW[ismAPIndex];

			if (!apsArePossible(issAP, ismAP)) {
				row.push("N/A" as const);
				continue;
			}

			const option = inkTankOptionsWhenNSubsUsed({
				ismAP,
				issAP,
				subsUsed,
				weaponSplId,
			});

			row.push({
				shots: option?.value ? Math.floor(option.value) : null,
				issAP,
				ismAP,
			});
		}

		result.push(row);
	}

	const withColors = addGridColors(result);

	return withColors;
}

// this is a performance optimization over simply calling "buildStats"
// as it would be doing a lot of unnecessary work
function inkTankOptionsWhenNSubsUsed({
	issAP,
	ismAP,
	subsUsed,
	weaponSplId,
}: {
	issAP: number;
	ismAP: number;
	subsUsed: number;
	weaponSplId: MainWeaponId;
}) {
	const mainWeaponParams = weaponParams().mainWeapons[weaponSplId];

	const subWeaponParams =
		weaponParams().subWeapons[mainWeaponParams.subWeaponId];

	const specialWeaponParams =
		weaponParams().specialWeapons[mainWeaponParams.specialWeaponId];

	const options = fullInkTankOptions({
		abilityPoints: new Map([
			["ISS", issAP],
			["ISM", ismAP],
		]),
		weaponSplId,
		hasTacticooler: false,
		mainOnlyAbilities: [],
		mainWeaponParams,
		specialWeaponParams,
		subWeaponParams,
	});

	return optionsToPreferred(options).find((o) => o.subsUsed === subsUsed);
}

const PREFERRED_KEYS: FullInkTankOption["type"][] = ["FULL_CHARGE"];
function optionsToPreferred(options: ReturnType<typeof fullInkTankOptions>) {
	if (!options.some((option) => PREFERRED_KEYS.includes(option.type))) {
		return options;
	}

	return options.filter((option) => PREFERRED_KEYS.includes(option.type));
}

function addGridColors(grid: ("N/A" | ShotCellData)[][]) {
	const maxValue = grid
		.flat()
		.filter(
			(v): v is { shots: number; ismAP: number; issAP: number } =>
				v !== "N/A" && v.shots !== null,
		)
		.reduce((max, v) => Math.max(max, v.shots), 0);

	const minValue = grid
		.flat()
		.filter(
			(v): v is { shots: number; ismAP: number; issAP: number } =>
				v !== "N/A" && v.shots !== null,
		)
		.reduce((min, v) => Math.min(min, v.shots), Number.POSITIVE_INFINITY);

	const result = grid.map((row) =>
		row.map((cell) => {
			if (cell === "N/A") return cell;
			if (cell.shots === null) return { ...cell, hex: undefined };

			const { shots } = cell;
			const hex = generateHexCode({
				minValue,
				maxValue,
				value: shots,
			});

			return {
				...cell,
				hex,
			};
		}),
	);

	return result;
}

function generateHexCode({
	minValue,
	maxValue,
	value,
}: {
	minValue: number;
	maxValue: number;
	value: number;
}) {
	const clampedValue = Math.max(minValue, Math.min(value, maxValue));
	const normalizedPosition = (clampedValue - minValue) / (maxValue - minValue);

	// Adjust saturation and brightness to lighten the colors
	const saturationFactor = 0.5; // Adjust this to control the saturation
	const brightnessFactor = 0.8; // Adjust this to control the brightness

	const red =
		Math.floor(255 * (1 - normalizedPosition) * saturationFactor) +
		Math.floor(255 * (1 - brightnessFactor));
	const green =
		Math.floor(255 * normalizedPosition * saturationFactor) +
		Math.floor(255 * (1 - brightnessFactor));
	const blue = Math.floor(255 * (1 - brightnessFactor));

	const hex = ((1 << 24) | (red << 16) | (green << 8) | blue)
		.toString(16)
		.slice(1)
		.toUpperCase();

	return `#${hex}`;
}
