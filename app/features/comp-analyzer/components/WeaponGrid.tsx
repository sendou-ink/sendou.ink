import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import { specialWeaponImageUrl, subWeaponImageUrl } from "~/utils/urls";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import type { CategorizationType } from "../comp-analyzer-types";
import styles from "./WeaponGrid.module.css";

interface WeaponGridProps {
	selectedWeaponIds: MainWeaponId[];
	onWeaponClick: (weaponId: MainWeaponId) => void;
	categorization: CategorizationType;
	onCategorizationChange: (categorization: CategorizationType) => void;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}

export function WeaponGrid({
	selectedWeaponIds,
	onWeaponClick,
	categorization,
	onCategorizationChange,
	isCollapsed,
	onToggleCollapse,
}: WeaponGridProps) {
	const { t } = useTranslation(["weapons", "analyzer"]);
	const isMaxSelected = selectedWeaponIds.length >= MAX_WEAPONS;

	const groupedWeapons = groupWeaponsByType(categorization);

	return (
		<div className={styles.container} data-testid="weapon-grid">
			<button
				type="button"
				className={styles.collapseToggle}
				onClick={onToggleCollapse}
				data-testid="weapon-grid-toggle"
			>
				<span
					className={`${styles.collapseArrow} ${isCollapsed ? styles.collapseArrowCollapsed : ""}`}
				>
					▼
				</span>
				<span>
					{isCollapsed
						? t("analyzer:comp.showWeaponGrid")
						: t("analyzer:comp.hideWeaponGrid")}
				</span>
			</button>

			{!isCollapsed ? (
				<>
					<div>
						<Label>{t("analyzer:comp.groupBy")}</Label>
						<div
							className={styles.categorizationToggle}
							data-testid="categorization-toggle"
						>
							<label className="stack horizontal sm items-center">
								<input
									type="radio"
									name="categorization"
									value="category"
									checked={categorization === "category"}
									onChange={() => onCategorizationChange("category")}
									data-testid="categorization-category"
								/>
								<span>{t("analyzer:comp.groupBy.category")}</span>
							</label>
							<label className="stack horizontal sm items-center">
								<input
									type="radio"
									name="categorization"
									value="sub"
									checked={categorization === "sub"}
									onChange={() => onCategorizationChange("sub")}
									data-testid="categorization-sub"
								/>
								<span>{t("analyzer:comp.groupBy.sub")}</span>
							</label>
							<label className="stack horizontal sm items-center">
								<input
									type="radio"
									name="categorization"
									value="special"
									checked={categorization === "special"}
									onChange={() => onCategorizationChange("special")}
									data-testid="categorization-special"
								/>
								<span>{t("analyzer:comp.groupBy.special")}</span>
							</label>
						</div>
					</div>

					<div className={styles.weaponGrid}>
						{groupedWeapons.map((group) => (
							<div key={group.key} className={styles.categorySection}>
								<div className={styles.categoryHeader}>
									{group.iconPath ? (
										<Image path={group.iconPath} alt="" size={24} />
									) : null}
									<span className={styles.categoryName}>
										{group.name.startsWith("SUB_") ||
										group.name.startsWith("SPECIAL_")
											? t(`weapons:${group.name}` as "SUB_0")
											: group.name}
									</span>
								</div>
								<div className={styles.categoryWeapons}>
									{group.weaponIds.map((weaponId) => {
										const isSelected = selectedWeaponIds.includes(weaponId);
										const isDisabled = !isSelected && isMaxSelected;

										return (
											<button
												key={weaponId}
												type="button"
												className={`${styles.weaponButton} ${isSelected ? styles.weaponButtonSelected : ""}`}
												onClick={() => onWeaponClick(weaponId)}
												disabled={isDisabled}
												title={t(`weapons:MAIN_${weaponId}`)}
												data-testid={`weapon-button-${weaponId}`}
											>
												<WeaponImage
													weaponSplId={weaponId}
													variant="build"
													size={32}
												/>
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</>
			) : null}
		</div>
	);
}

interface WeaponGroup {
	key: string;
	name: string;
	iconPath: string | null;
	weaponIds: MainWeaponId[];
}

function groupWeaponsByType(categorization: CategorizationType): WeaponGroup[] {
	if (categorization === "category") {
		return weaponCategories.map((category) => ({
			key: category.name,
			name: category.name.toLowerCase(),
			iconPath: `/static-assets/img/weapon-categories/${category.name}`,
			weaponIds: [...category.weaponIds] as MainWeaponId[],
		}));
	}

	if (categorization === "sub") {
		return subWeaponIds
			.map((subId) => {
				const weaponsWithSub = mainWeaponIds.filter((weaponId) => {
					const params = mainWeaponParams(weaponId);
					return params.subWeaponId === subId;
				});

				return {
					key: `sub-${subId}`,
					name: `SUB_${subId}`,
					iconPath: subWeaponImageUrl(subId as SubWeaponId),
					weaponIds: weaponsWithSub,
				};
			})
			.filter((group) => group.weaponIds.length > 0);
	}

	return specialWeaponIds
		.map((specialId) => {
			const weaponsWithSpecial = mainWeaponIds.filter((weaponId) => {
				const params = mainWeaponParams(weaponId);
				return params.specialWeaponId === specialId;
			});

			return {
				key: `special-${specialId}`,
				name: `SPECIAL_${specialId}`,
				iconPath: specialWeaponImageUrl(specialId as SpecialWeaponId),
				weaponIds: weaponsWithSpecial,
			};
		})
		.filter((group) => group.weaponIds.length > 0);
}
