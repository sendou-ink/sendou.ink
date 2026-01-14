import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import {
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { WeaponSelect } from "~/components/WeaponSelect";
import { useIsMounted } from "~/hooks/useIsMounted";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl } from "~/utils/urls";
import { mainWeaponParams } from "../../build-analyzer/core/utils";
import type { DamageCombo } from "../comp-analyzer-types";
import { findDamageCombos } from "../core/combo-finder";
import "../comp-analyzer.css";

const COMP_ANALYZER_URL = "/comp-analyzer";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Composition Analyzer",
		ogTitle: "Splatoon 3 Team Composition Damage Analyzer",
		location: args.location,
		description:
			"Analyze team composition damage combos. Find out which hits from your team's weapons can combine to reach 100+ damage.",
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "analyzer"],
	breadcrumb: () => ({
		imgPath: navIconUrl("analyzer"),
		href: COMP_ANALYZER_URL,
		type: "IMAGE",
	}),
};

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export default function CompAnalyzerShell() {
	const isMounted = useIsMounted();

	if (!isMounted) {
		return <Placeholder />;
	}

	return <CompAnalyzerPage />;
}

const SLOT_COLORS = [
	"var(--theme-secondary)",
	"var(--theme-success)",
	"var(--theme-warning)",
	"var(--theme)",
];

function CompAnalyzerPage() {
	const [selectedWeapons, setSelectedWeapons] = useState<MainWeaponId[]>([]);
	const [latestWeapon, setLatestWeapon] = useState<MainWeaponId | null>(null);

	const isComplete = selectedWeapons.length === 4;
	const disabledWeaponIds = selectedWeapons;

	const combos = isComplete ? findDamageCombos(selectedWeapons) : [];

	const addWeapon = (weaponId: MainWeaponId) => {
		if (selectedWeapons.length < 4) {
			setSelectedWeapons([...selectedWeapons, weaponId]);
			setLatestWeapon(weaponId);
		}
	};

	const removeWeapon = (index: number) => {
		setSelectedWeapons(selectedWeapons.filter((_, i) => i !== index));
	};

	return (
		<Main className="comp-analyzer">
			<h1 className="comp-analyzer__title">Composition Analyzer</h1>

			<div className="comp-analyzer__slots-container">
				<div className="comp-analyzer__slots">
					{[0, 1, 2, 3].map((slot) => {
						const weaponId = selectedWeapons[slot];
						const params =
							weaponId !== undefined ? mainWeaponParams(weaponId) : null;

						return (
							<div
								key={slot}
								className="comp-analyzer__slot"
								style={{ borderColor: SLOT_COLORS[slot] }}
							>
								{weaponId !== undefined && params ? (
									<>
										<button
											type="button"
											className="comp-analyzer__slot-remove"
											onClick={() => removeWeapon(slot)}
											aria-label="Remove weapon"
											style={{ backgroundColor: SLOT_COLORS[slot] }}
										>
											×
										</button>
										<WeaponImage
											weaponSplId={weaponId}
											variant="badge"
											size={48}
										/>
										<div className="comp-analyzer__slot-icons">
											<SubWeaponImage
												subWeaponId={params.subWeaponId}
												width={22}
												height={22}
											/>
											<SpecialWeaponImage
												specialWeaponId={params.specialWeaponId}
												width={22}
												height={22}
											/>
										</div>
									</>
								) : (
									<div className="comp-analyzer__slot-empty">
										<span className="comp-analyzer__slot-number">
											{slot + 1}
										</span>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{!isComplete ? (
					<div className="comp-analyzer__picker">
						<WeaponSelect
							key={latestWeapon ?? "empty"}
							label="Add weapon"
							disabledWeaponIds={disabledWeaponIds}
							onChange={addWeapon}
						/>
					</div>
				) : null}
			</div>

			{isComplete ? (
				<div className="comp-analyzer__combos">
					<div className="comp-analyzer__combos-header">
						<h2 className="comp-analyzer__combos-title">
							Damage Combos (100+)
						</h2>
					</div>
					{combos.length === 0 ? (
						<p className="comp-analyzer__no-combos">No combos found</p>
					) : (
						<div className="comp-analyzer__combos-list">
							{combos.map((combo) => (
								<DamageComboBar
									key={combo.id}
									combo={combo}
									weapons={selectedWeapons}
								/>
							))}
						</div>
					)}
				</div>
			) : null}
		</Main>
	);
}

function DamageComboBar({
	combo,
	weapons,
}: {
	combo: DamageCombo;
	weapons: MainWeaponId[];
}) {
	const { t } = useTranslation(["weapons"]);

	const groupedSources = combo.sources.reduce(
		(acc, source) => {
			const key = `${source.weaponSlot}-${source.sourceType}-${source.damageType}`;
			const existing = acc.find((g) => g.key === key);
			if (existing) {
				existing.count++;
				existing.totalDamage += source.damage;
			} else {
				acc.push({
					key,
					source,
					count: 1,
					totalDamage: source.damage,
				});
			}
			return acc;
		},
		[] as Array<{
			key: string;
			source: (typeof combo.sources)[0];
			count: number;
			totalDamage: number;
		}>,
	);

	const renderWeaponIcon = (group: (typeof groupedSources)[0]) => {
		const { sourceType, sourceId } = group.source;
		if (sourceType === "SUB") {
			return (
				<SubWeaponImage
					subWeaponId={sourceId as SubWeaponId}
					width={20}
					height={20}
				/>
			);
		}
		if (sourceType === "SPECIAL") {
			return (
				<SpecialWeaponImage
					specialWeaponId={sourceId as SpecialWeaponId}
					width={20}
					height={20}
				/>
			);
		}
		return (
			<WeaponImage
				weaponSplId={sourceId as MainWeaponId}
				variant="badge"
				size={20}
			/>
		);
	};

	const thresholdPercent = (100 / combo.totalDamage) * 100;

	return (
		<div className="damage-combo-bar">
			<div className="damage-combo-bar__segments">
				{groupedSources.map((group) => {
					const widthPercent = (group.totalDamage / combo.totalDamage) * 100;
					const weaponId = weapons[group.source.weaponSlot];
					return (
						<div
							key={group.key}
							className="damage-combo-bar__segment"
							style={{
								width: `${widthPercent}%`,
								backgroundColor: SLOT_COLORS[group.source.weaponSlot],
							}}
							title={`${t(`weapons:MAIN_${weaponId}`)} ${group.source.sourceType} ${group.source.label}: ${group.totalDamage.toFixed(1)}`}
						>
							{renderWeaponIcon(group)}
							<span className="damage-combo-bar__segment-text">
								{group.count > 1 ? `${group.count}×` : ""}
								{group.totalDamage.toFixed(0)}
							</span>
							<span className="damage-combo-bar__segment-label">
								{group.source.label}
							</span>
						</div>
					);
				})}
				<div
					className="damage-combo-bar__threshold"
					style={{ left: `${thresholdPercent}%` }}
				/>
			</div>
			<div className="damage-combo-bar__info">
				<span className="damage-combo-bar__total">
					{combo.totalDamage.toFixed(1)}
				</span>
				<span className="damage-combo-bar__hits">
					{combo.hitCount} hit{combo.hitCount !== 1 ? "s" : ""}
				</span>
			</div>
		</div>
	);
}
