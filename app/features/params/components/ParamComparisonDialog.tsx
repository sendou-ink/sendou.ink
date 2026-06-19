import clsx from "clsx";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouDialog } from "~/components/elements/Dialog";
import * as WeaponParams from "../core/WeaponParams";
import type {
	ParamComparisonEntry,
	WeaponParamKind,
} from "../weapon-params-types";
import styles from "./ParamComparisonDialog.module.css";
import { WeaponParamImage } from "./WeaponParamsTable";

/**
 * Modal with a simple horizontal bar chart comparing one parameter's numeric value across the
 * currently visible weapons. Bars are scaled relative to the largest absolute value so weapons can
 * be compared at a glance.
 */
export function ParamComparisonDialog({
	kind,
	label,
	entries,
	currentWeaponId,
	onClose,
}: {
	kind: WeaponParamKind;
	label: string;
	entries: ParamComparisonEntry[];
	currentWeaponId: number;
	onClose: () => void;
}) {
	const { t } = useTranslation(["params"]);

	const sortedEntries = R.sortBy(entries, [(entry) => entry.value, "desc"]);
	const maxValue = Math.max(...entries.map((entry) => Math.abs(entry.value)));

	return (
		<SendouDialog
			heading={t("params:compare.heading", { parameter: label })}
			onClose={onClose}
		>
			<div className={styles.bars}>
				{sortedEntries.map((entry) => (
					<div key={entry.weaponId} className={styles.row}>
						<div className={styles.weapon}>
							<WeaponParamImage kind={kind} id={entry.weaponId} size={28} />
							<span className={styles.name}>{entry.name}</span>
						</div>
						<div className={styles.barTrack}>
							<div
								className={clsx(styles.barFill, {
									[styles.barFillCurrent]: entry.weaponId === currentWeaponId,
								})}
								style={{
									width: `${maxValue === 0 ? 0 : (Math.abs(entry.value) / maxValue) * 100}%`,
								}}
							/>
						</div>
						<span className={styles.value}>
							{WeaponParams.formatValue(entry.value)}
						</span>
					</div>
				))}
			</div>
		</SendouDialog>
	);
}
