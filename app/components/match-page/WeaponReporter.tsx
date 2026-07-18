import { Crosshair } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useUser } from "~/features/auth/core/user";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { abilityImageUrl, SETTINGS_PAGE } from "~/utils/urls";
import { SendouButton } from "../elements/Button";
import { Image, StageImage, WeaponImage } from "../Image";
import { WeaponSelect } from "../WeaponSelect";
import { SecondaryAction } from "./SecondaryAction";
import styles from "./WeaponReporter.module.css";

interface WeaponReporterMap {
	stageId: StageId;
	mode: ModeShort;
}

export interface WeaponReporterProps {
	maps: WeaponReporterMap[];
	pastReported: MainWeaponId[];
	nextMapIndex: number;
	quickSelectWeaponIds?: MainWeaponId[];
	onSubmit: (weaponSplId: MainWeaponId) => void;
	onUndo: () => void;
	isSubmitting?: boolean;
	standalone?: boolean;
}

export function WeaponReporter({
	maps,
	pastReported,
	nextMapIndex,
	quickSelectWeaponIds,
	onSubmit,
	onUndo,
	isSubmitting,
	standalone,
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

	const inputTargetMap = nextMapIndex >= 0 ? maps[nextMapIndex] : undefined;
	const unreportedCount = inputTargetMap
		? maps.length - pastReported.length - 1
		: maps.length - pastReported.length;
	const allReported =
		pastReported.length > 0 && !inputTargetMap && unreportedCount === 0;

	const handleToggle = (newOpen: boolean) => {
		setIsOpen(newOpen);
		fetcher.submit(
			{ _action: "UPDATE_WEAPON_REPORT_DEFAULT_OPEN", newValue: newOpen },
			{ method: "post", action: SETTINGS_PAGE, encType: "application/json" },
		);
	};

	return (
		<SecondaryAction
			isOpen={isOpen}
			onOpenChange={handleToggle}
			collapsedLabel={t("q:match.actions.reportWeapons")}
			collapsedIcon={<Crosshair size={16} />}
			standalone={standalone}
			alwaysOpen={allReported}
		>
			{inputTargetMap ? (
				<div className={styles.mapRow}>
					<MapInfo map={inputTargetMap} />
					<div className={styles.inputRow}>
						<div className={styles.weaponSelectContainer}>
							<WeaponSelect
								label={`${t("q:match.weapon.yourWeapon")} #${nextMapIndex + 1}`}
								value={selectedWeapon}
								onChange={setSelectedWeapon}
								quickSelectWeaponsIds={quickSelectWeaponIds}
							/>
						</div>
						<SendouButton
							variant="primary"
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
		</SecondaryAction>
	);
}

function MapInfo({ map }: { map: WeaponReporterMap }) {
	return (
		<div className={styles.mapInfo}>
			<StageImage
				stageId={map.stageId}
				width={100}
				className={styles.stageImage}
			/>
		</div>
	);
}
