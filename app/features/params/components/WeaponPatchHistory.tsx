import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import {
	formatParamValue,
	SPECIAL_POINTS_PARAM_KEY,
} from "../core/weapon-params";
import type { PatchChange, WeaponPatch } from "../weapon-params-types";
import styles from "./WeaponPatchHistory.module.css";

const PATCH_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "short",
	year: "numeric",
};

export function WeaponPatchHistory({ patches }: { patches: WeaponPatch[] }) {
	const { t } = useTranslation(["common"]);

	if (patches.length === 0) {
		return (
			<div className={styles.empty}>{t("common:weaponParams.noPatches")}</div>
		);
	}

	return (
		<div className={styles.container}>
			{patches.map((patch) => (
				<div key={patch.version} className={styles.column}>
					<div className={styles.header}>
						<div className={styles.version}>{patch.version}</div>
						{patch.date ? (
							<LocaleTime
								date={new Date(patch.date)}
								options={PATCH_DATE_OPTIONS}
								className={styles.date}
							/>
						) : null}
					</div>
					<div className={styles.changes}>
						{patch.changes.map((change) => (
							<ChangeBadge
								key={`${change.category}.${change.key}.${change.weaponId ?? ""}`}
								change={change}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function ChangeBadge({ change }: { change: PatchChange }) {
	const { t } = useTranslation(["analyzer"]);

	const isSpecialPoints = change.category === SPECIAL_POINTS_PARAM_KEY;
	const label = isSpecialPoints ? t("analyzer:stat.specialPoints") : change.key;

	return (
		<div
			className={clsx(styles.change, {
				[styles.buff]: change.kind === "buff",
				[styles.nerf]: change.kind === "nerf",
			})}
			title={isSpecialPoints ? undefined : `${change.category}.${change.key}`}
		>
			<span className={styles.changeName}>
				{isSpecialPoints && change.weaponId ? (
					<WeaponImage
						weaponSplId={change.weaponId}
						variant="badge"
						size={20}
						className={styles.changeIcon}
					/>
				) : null}
				{label}
			</span>
			<span className={styles.changeValues}>
				{formatParamValue(change.from)}
				<span className={styles.arrow}>→</span>
				{formatParamValue(change.to)}
			</span>
		</div>
	);
}
