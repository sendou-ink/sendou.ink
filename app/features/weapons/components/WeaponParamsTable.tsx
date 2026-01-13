import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { WeaponImage } from "~/components/Image";
import { mySlugify, weaponPage } from "~/utils/urls";
import {
	collectAllParamKeys,
	formatParamValue,
	hasParamHistory,
} from "../core/weapon-params";
import type {
	ParamValueWithHistory,
	WeaponParamsTableProps,
} from "../weapon-params-types";
import styles from "./WeaponParamsTable.module.css";

export function WeaponParamsTable({
	currentWeaponId,
	categoryWeaponIds,
	weaponParams,
}: WeaponParamsTableProps) {
	const { t } = useTranslation(["weapons", "common"]);
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

	const currentWeaponHasParam = (category: string, key: string) => {
		return Boolean(
			weaponParams[String(currentWeaponId)]?.categories[category]?.[key],
		);
	};

	const rowHasHistory = (category: string, key: string) => {
		return sortedWeaponIds.some((id) => {
			const param = weaponParams[String(id)]?.categories[category]?.[key];
			return param && hasParamHistory(param);
		});
	};

	return (
		<div className={styles.container}>
			<table className={styles.table}>
				<thead className={styles.thead}>
					<tr>
						<th className={styles.paramHeader}>
							{t("common:header.parameter")}
						</th>
						{sortedWeaponIds.map((weaponId) => {
							const weaponName = t(`weapons:MAIN_${weaponId}`);
							const slug = mySlugify(
								t(`weapons:MAIN_${weaponId}`, { lng: "en" }),
							);

							return (
								<th
									key={weaponId}
									className={clsx(styles.weaponHeader, {
										[styles.currentWeapon]: weaponId === currentWeaponId,
									})}
								>
									<Link
										to={weaponPage(slug)}
										className={styles.weaponHeaderContent}
									>
										<WeaponImage
											weaponSplId={weaponId}
											variant="badge"
											size={32}
										/>
										<span className={styles.weaponName}>{weaponName}</span>
									</Link>
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
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
										colSpan={sortedWeaponIds.length + 1}
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
											{sortedWeaponIds.map((weaponId) => (
												<ParamCell
													key={weaponId}
													param={
														weaponParams[String(weaponId)]?.categories[
															category
														]?.[key]
													}
													isCurrentWeapon={weaponId === currentWeaponId}
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

function ParamCell({
	param,
	isCurrentWeapon,
	isExpanded,
}: {
	param: ParamValueWithHistory | undefined;
	isCurrentWeapon: boolean;
	isExpanded: boolean;
}) {
	if (!param) {
		return (
			<td
				className={clsx(styles.paramCell, {
					[styles.currentWeapon]: isCurrentWeapon,
				})}
			>
				<span className={styles.noValue}>—</span>
			</td>
		);
	}

	const showHistory = isExpanded && param.history.length > 0;

	return (
		<td
			className={clsx(styles.paramCell, {
				[styles.currentWeapon]: isCurrentWeapon,
			})}
		>
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
