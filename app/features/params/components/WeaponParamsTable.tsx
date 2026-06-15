import clsx from "clsx";
import { ChevronDown, ChevronUp, EyeOff, X } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import { useSearchParamStateEncoder } from "~/hooks/useSearchParamState";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mySlugify, weaponParamsPage } from "~/utils/urls";
import {
	collectAllParamKeys,
	formatParamValue,
	hasParamHistory,
} from "../core/weapon-params";
import type {
	ParamValueWithHistory,
	SpecialPointWithHistory,
	WeaponParamsTableProps,
} from "../weapon-params-types";
import styles from "./WeaponParamsTable.module.css";

const SPECIAL_POINTS_KEY = "__specialPoints__";

export function WeaponParamsTable({
	currentWeaponId,
	categoryWeaponIds,
	weaponParams,
	specialPoints,
}: WeaponParamsTableProps) {
	const { t } = useTranslation(["weapons", "common", "analyzer"]);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	const paramDefinitions = collectAllParamKeys(weaponParams);

	const paramsByCategory: Record<
		string,
		Array<{ key: string; fullKey: string }>
	> = {};
	for (const def of paramDefinitions) {
		if (!paramsByCategory[def.category]) {
			paramsByCategory[def.category] = [];
		}
		paramsByCategory[def.category].push({ key: def.key, fullKey: def.fullKey });
	}

	const toggleRow = (fullKey: string) => {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(fullKey)) {
				next.delete(fullKey);
			} else {
				next.add(fullKey);
			}
			return next;
		});
	};

	const sortedWeaponIds = [
		currentWeaponId,
		...categoryWeaponIds.filter((id) => id !== currentWeaponId),
	];

	const [hiddenWeaponIds, setHiddenWeaponIds] = useSearchParamStateEncoder<
		MainWeaponId[]
	>({
		name: "hidden",
		defaultValue: [],
		revive: (value) =>
			value
				.split(",")
				.map(Number)
				.filter(
					(id) =>
						!Number.isNaN(id) &&
						id !== currentWeaponId &&
						categoryWeaponIds.includes(id as MainWeaponId),
				) as MainWeaponId[],
		encode: (ids) => ids.join(","),
	});

	const hiddenSet = new Set(hiddenWeaponIds);
	const visibleWeaponIds = sortedWeaponIds.filter((id) => !hiddenSet.has(id));

	const hideWeapon = (weaponId: MainWeaponId) =>
		setHiddenWeaponIds([...hiddenWeaponIds, weaponId]);
	const restoreWeapon = (weaponId: MainWeaponId) =>
		setHiddenWeaponIds(hiddenWeaponIds.filter((id) => id !== weaponId));
	const showAllWeapons = () => setHiddenWeaponIds([]);

	const currentWeaponHasParam = (category: string, key: string) => {
		return Boolean(
			weaponParams[String(currentWeaponId)]?.categories[category]?.[key],
		);
	};

	const rowHasHistory = (category: string, key: string) => {
		return visibleWeaponIds.some((id) => {
			const param = weaponParams[String(id)]?.categories[category]?.[key];
			return param && hasParamHistory(param);
		});
	};

	return (
		<div className={styles.container}>
			{hiddenWeaponIds.length > 0 ? (
				<HiddenWeaponsBar
					hiddenWeaponIds={hiddenWeaponIds}
					onRestore={restoreWeapon}
					onShowAll={showAllWeapons}
				/>
			) : null}
			<table className={styles.table}>
				<thead className={styles.thead}>
					<tr>
						<th className={styles.paramHeader}>
							{t("common:header.parameter")}
						</th>
						{visibleWeaponIds.map((weaponId) => {
							const weaponName = t(`weapons:MAIN_${weaponId}`);
							const slug = mySlugify(
								t(`weapons:MAIN_${weaponId}`, { lng: "en" }),
							);

							return (
								<th key={weaponId} className={clsx(styles.weaponHeader, {})}>
									<Link
										to={weaponParamsPage(slug)}
										className={styles.weaponHeaderContent}
									>
										<WeaponImage
											weaponSplId={weaponId}
											variant="badge"
											size={32}
										/>
										<span className={styles.weaponName}>{weaponName}</span>
									</Link>
									{weaponId !== currentWeaponId ? (
										<SendouButton
											variant="minimal-destructive"
											size="miniscule"
											shape="square"
											icon={<X />}
											className={styles.hideButton}
											onPress={() => hideWeapon(weaponId)}
											aria-label={t("common:actions.hide")}
											testId={`hide-weapon-${weaponId}`}
										/>
									) : null}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					<SpecialPointsRow
						visibleWeaponIds={visibleWeaponIds}
						specialPoints={specialPoints}
						isExpanded={expandedRows.has(SPECIAL_POINTS_KEY)}
						onToggle={() => toggleRow(SPECIAL_POINTS_KEY)}
					/>
					{Object.entries(paramsByCategory).map(([category, params]) => {
						const filteredParams = params.filter(({ key }) =>
							currentWeaponHasParam(category, key),
						);

						if (filteredParams.length === 0) {
							return null;
						}

						return (
							<Fragment key={category}>
								<tr>
									<td
										colSpan={visibleWeaponIds.length + 1}
										className={styles.categoryHeader}
									>
										{category}
									</td>
								</tr>
								{filteredParams.map(({ key, fullKey }) => {
									const isExpanded = expandedRows.has(fullKey);
									const hasHistory = rowHasHistory(category, key);

									return (
										<tr
											key={fullKey}
											className={clsx({
												[styles.expandableRow]: hasHistory,
											})}
										>
											<td
												className={styles.paramName}
												onClick={
													hasHistory ? () => toggleRow(fullKey) : undefined
												}
											>
												<span className={styles.paramNameText}>{key}</span>
												{hasHistory ? (
													<span className={styles.historyIndicator}>
														{isExpanded ? (
															<ChevronUp size={14} />
														) : (
															<ChevronDown size={14} />
														)}
													</span>
												) : null}
											</td>
											{visibleWeaponIds.map((weaponId) => (
												<ParamCell
													key={weaponId}
													param={
														weaponParams[String(weaponId)]?.categories[
															category
														]?.[key]
													}
													isExpanded={isExpanded}
												/>
											))}
										</tr>
									);
								})}
							</Fragment>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function HiddenWeaponsBar({
	hiddenWeaponIds,
	onRestore,
	onShowAll,
}: {
	hiddenWeaponIds: MainWeaponId[];
	onRestore: (weaponId: MainWeaponId) => void;
	onShowAll: () => void;
}) {
	const { t } = useTranslation(["weapons", "common"]);

	return (
		<div className={styles.hiddenBar}>
			<EyeOff
				size={16}
				className={styles.hiddenBarLabel}
				aria-label="Show all"
			/>
			{hiddenWeaponIds.map((weaponId) => (
				<SendouButton
					key={weaponId}
					variant="minimal"
					size="miniscule"
					className={styles.hiddenBadge}
					onPress={() => onRestore(weaponId)}
					testId={`restore-weapon-${weaponId}`}
				>
					<WeaponImage weaponSplId={weaponId} variant="badge" size={20} />
					<span className={styles.hiddenBadgeName}>
						{t(`weapons:MAIN_${weaponId}`)}
					</span>
					<X size={12} />
				</SendouButton>
			))}
			<SendouButton
				variant="minimal"
				size="miniscule"
				onPress={onShowAll}
				testId="show-all-weapons"
			>
				{t("common:actions.showAll")}
			</SendouButton>
		</div>
	);
}

function SpecialPointsRow({
	visibleWeaponIds,
	specialPoints,
	isExpanded,
	onToggle,
}: {
	visibleWeaponIds: MainWeaponId[];
	specialPoints: Record<string, SpecialPointWithHistory[]>;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation(["analyzer"]);

	const hasHistory = visibleWeaponIds.some((id) =>
		specialPoints[String(id)]?.some((kit) => kit.history.length > 0),
	);

	return (
		<tr className={clsx({ [styles.expandableRow]: hasHistory })}>
			<td
				className={styles.paramName}
				onClick={hasHistory ? onToggle : undefined}
			>
				<span className={styles.paramNameText}>
					{t("analyzer:stat.specialPoints")}
				</span>
				{hasHistory ? (
					<span className={styles.historyIndicator}>
						{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
					</span>
				) : null}
			</td>
			{visibleWeaponIds.map((weaponId) => (
				<SpecialPointCell
					key={weaponId}
					kits={specialPoints[String(weaponId)] ?? []}
					isExpanded={isExpanded}
				/>
			))}
		</tr>
	);
}

function SpecialPointCell({
	kits,
	isExpanded,
}: {
	kits: SpecialPointWithHistory[];
	isExpanded: boolean;
}) {
	const { t } = useTranslation(["analyzer"]);
	const suffix = t("analyzer:suffix.specialPointsShort");

	if (kits.length === 0) {
		return (
			<td className={styles.paramCell}>
				<span className={styles.noValue}>—</span>
			</td>
		);
	}

	const kitsWithHistory = kits.filter((kit) => kit.history.length > 0);
	const showHistory = isExpanded && kitsWithHistory.length > 0;

	return (
		<td className={styles.paramCell}>
			<div className={styles.cellContent}>
				<span className={styles.currentValue}>
					{kits.map((kit) => `${kit.current}${suffix}`).join(" / ")}
				</span>
				{kitsWithHistory.length > 0 && !isExpanded ? (
					<span className={styles.historyBadge}>{kitsWithHistory.length}</span>
				) : null}
			</div>
			{showHistory ? (
				<div className={styles.specialPointHistory}>
					{kitsWithHistory.map((kit) => (
						<div key={kit.weaponId} className={styles.specialPointHistoryKit}>
							<WeaponImage
								weaponSplId={kit.weaponId}
								variant="badge"
								size={24}
							/>
							<div className={styles.specialPointHistoryKitList}>
								{kit.history.toReversed().map(({ version, value }) => (
									<div key={version} className={styles.historyItem}>
										<span className={styles.historyValue}>
											{`${value}${suffix}`}
										</span>
										<span className={styles.historyVersion}>{version}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			) : null}
		</td>
	);
}

function ParamCell({
	param,
	isExpanded,
}: {
	param: ParamValueWithHistory | undefined;
	isExpanded: boolean;
}) {
	if (!param) {
		return (
			<td className={clsx(styles.paramCell)}>
				<span className={styles.noValue}>—</span>
			</td>
		);
	}

	const showHistory = isExpanded && param.history.length > 0;

	return (
		<td className={styles.paramCell}>
			<div className={styles.cellContent}>
				<span className={styles.currentValue}>
					{formatParamValue(param.current)}
				</span>
				{param.history.length > 0 && !isExpanded ? (
					<span className={styles.historyBadge}>{param.history.length}</span>
				) : null}
			</div>
			{showHistory ? (
				<div className={styles.historyList}>
					{param.history.toReversed().map(({ version, value }) => (
						<div key={version} className={styles.historyItem}>
							<span className={styles.historyValue}>
								{formatParamValue(value)}
							</span>
							<span className={styles.historyVersion}>{version}</span>
						</div>
					))}
				</div>
			) : null}
		</td>
	);
}
