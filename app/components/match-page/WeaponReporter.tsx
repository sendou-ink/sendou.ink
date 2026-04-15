import clsx from "clsx";
import { ChevronUp, Crosshair } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { abilityImageUrl, SETTINGS_PAGE } from "~/utils/urls";
import { SendouButton } from "../elements/Button";
import { Image, ModeImage, StageImage, WeaponImage } from "../Image";
import { WeaponSelect } from "../WeaponSelect";
import styles from "./WeaponReporter.module.css";

interface WeaponReporterMap {
	stageId: StageId;
	mode: ModeShort;
}

export interface WeaponReporterProps {
	maps: WeaponReporterMap[];
	pastReported: MainWeaponId[];
	quickSelectWeaponIds?: MainWeaponId[];
	onSubmit: (weaponSplId: MainWeaponId) => void;
	onUndo: () => void;
	isSubmitting?: boolean;
}

// xxx: on sendouq all weapons report different / component tab..? or not? check usage
export function WeaponReporter({
	maps,
	pastReported,
	quickSelectWeaponIds,
	onSubmit,
	onUndo,
	isSubmitting,
}: WeaponReporterProps) {
	const { t } = useTranslation(["q", "game-misc", "common"]);
	const user = useUser();
	const fetcher = useFetcher();
	const [isOpen, setIsOpen] = useState(
		() => user?.preferences.weaponReportDefaultOpen ?? false,
	);
	const [selectedWeapon, setSelectedWeapon] = useState<MainWeaponId | null>(
		null,
	);

	const inputTargetIndex = pastReported.length;

	const inputTargetMap = maps[inputTargetIndex];
	const unreportedCount =
		maps.length - inputTargetIndex - (inputTargetMap ? 1 : 0);

	const handleToggle = (newOpen: boolean) => {
		setIsOpen(newOpen);
		fetcher.submit(
			{ _action: "UPDATE_WEAPON_REPORT_DEFAULT_OPEN", newValue: newOpen },
			{ method: "post", action: SETTINGS_PAGE, encType: "application/json" },
		);
	};

	if (!isOpen) {
		return (
			<div className={styles.rootCollapsed}>
				<SendouButton
					variant="minimal"
					size="small"
					icon={<Crosshair size={16} />}
					onPress={() => handleToggle(true)}
				>
					{t("q:match.actions.reportWeapons")}
				</SendouButton>
			</div>
		);
	}

	return (
		<div className={clsx(styles.root, styles.rootExpanded)}>
			<SendouButton
				variant="minimal"
				size="miniscule"
				icon={<ChevronUp size={22} />}
				onPress={() => handleToggle(false)}
				className={styles.collapseButton}
				aria-label={t("q:match.actions.reportWeapons")}
			/>
			{pastReported.length > 0 ? (
				<div className={styles.pastRow}>
					{pastReported.map((weaponId, i) => (
						<WeaponImage
							key={i}
							weaponSplId={weaponId}
							variant="badge"
							size={24}
						/>
					))}
					<SendouButton
						variant="minimal"
						size="small"
						isDisabled={isSubmitting}
						onPress={onUndo}
					>
						{t("q:match.weapon.undoWeapon")}
					</SendouButton>
				</div>
			) : null}
			{inputTargetMap ? (
				<div className={styles.mapRow}>
					<MapInfo map={inputTargetMap} />
					<div className={styles.inputRow}>
						<div className={styles.weaponSelectContainer}>
							<WeaponSelect
								label={t("q:match.weapon.yourWeapon")}
								value={selectedWeapon}
								onChange={setSelectedWeapon}
								quickSelectWeaponsIds={quickSelectWeaponIds}
							/>
						</div>
						<SendouButton
							variant="primary"
							size="small"
							isDisabled={selectedWeapon === null || isSubmitting}
							onPress={() => {
								if (selectedWeapon === null) return;
								onSubmit(selectedWeapon);
								setSelectedWeapon(null);
							}}
						>
							{t("common:actions.submit")}
						</SendouButton>
					</div>
				</div>
			) : null}
			{unreportedCount > 0 ? (
				<div className={styles.unreportedRow}>
					{Array.from({ length: unreportedCount }, (_, i) => (
						<Image
							key={i}
							path={abilityImageUrl("UNKNOWN")}
							alt="?"
							size={24}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function MapInfo({ map }: { map: WeaponReporterMap }) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className={styles.mapInfo}>
			<StageImage
				stageId={map.stageId}
				width={60}
				className={styles.stageImage}
			/>
			<div className={styles.mapLabel}>
				<ModeImage mode={map.mode} size={14} />
				<span>{shortStageName(t(`game-misc:STAGE_${map.stageId}`))}</span>
			</div>
		</div>
	);
}
