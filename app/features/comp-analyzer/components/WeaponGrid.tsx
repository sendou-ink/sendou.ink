import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "~/components/EmptyState";
import {
	OutlinedImage,
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import { weaponCategoryUrl } from "~/utils/urls";
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
	/** Shown in the top row, before the search */
	actions: React.ReactNode;
}

export function WeaponGrid({
	selectedWeaponIds,
	onWeaponClick,
	categorization,
	onCategorizationChange,
	isCollapsed,
	onToggleCollapse,
	actions,
}: WeaponGridProps) {
	const { t } = useTranslation(["weapons", "analyzer", "common"]);
	const [searchTerm, setSearchTerm] = useState("");
	const isMaxSelected = selectedWeaponIds.length >= MAX_WEAPONS;

	const trimmedSearchTerm = searchTerm.trim();

	const handleSearchChange = (value: string) => {
		setSearchTerm(value);
		if (isCollapsed && value.trim()) {
			onToggleCollapse();
		}
	};

	const handleWeaponClick = (weaponId: MainWeaponId) => {
		onWeaponClick(weaponId);
		setSearchTerm("");
	};
	const groupedWeapons = groupWeaponsByType(categorization)
		.map((group) => ({
			...group,
			weaponIds: group.weaponIds.filter((weaponId) =>
				filterWeapon({
					weapon: { type: "MAIN", id: weaponId },
					weaponName: t(`weapons:MAIN_${weaponId}`),
					searchTerm: trimmedSearchTerm,
				}),
			),
		}))
		.filter((group) => group.weaponIds.length > 0);

	return (
		<div className={styles.container} data-testid="weapon-grid">
			<div className={styles.toolbar}>
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
				<div className={styles.actions}>{actions}</div>
				<Input
					type="search"
					className={styles.search}
					icon={<SearchIcon />}
					value={searchTerm}
					onChange={(e) => handleSearchChange(e.target.value)}
					placeholder={t("common:forms.weaponSearch.search.placeholder")}
					aria-label={t("common:forms.weaponSearch.search.placeholder")}
					testId="weapon-search"
				/>
			</div>

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

					{groupedWeapons.length === 0 ? (
						<EmptyState navItem="comp-analyzer">
							{t("common:noResults")}
						</EmptyState>
					) : null}
					<div className={styles.weaponGrid}>
						{groupedWeapons.map((group) => (
							<div key={group.key} className={styles.categorySection}>
								<div className={styles.categoryHeader}>
									<WeaponGroupIcon icon={group.icon} />
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
												onClick={() => handleWeaponClick(weaponId)}
												disabled={isDisabled}
												title={t(`weapons:MAIN_${weaponId}`)}
												data-testid={`weapon-button-${weaponId}`}
											>
												<WeaponImage
													weaponSplId={weaponId}
													variant="badge"
													size={36}
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

type WeaponGroupIconValue =
	| { kind: "category"; name: (typeof weaponCategories)[number]["name"] }
	| { kind: "sub"; id: SubWeaponId }
	| { kind: "special"; id: SpecialWeaponId };

interface WeaponGroup {
	key: string;
	name: string;
	icon: WeaponGroupIconValue;
	weaponIds: MainWeaponId[];
}

function WeaponGroupIcon({ icon }: { icon: WeaponGroupIconValue }) {
	switch (icon.kind) {
		case "category":
			return (
				<OutlinedImage path={weaponCategoryUrl(icon.name)} alt="" size={24} />
			);
		case "sub":
			return <SubWeaponImage subWeaponId={icon.id} size={24} />;
		case "special":
			return <SpecialWeaponImage specialWeaponId={icon.id} size={24} />;
	}
}

function groupWeaponsByType(categorization: CategorizationType): WeaponGroup[] {
	if (categorization === "category") {
		return weaponCategories.map((category) => ({
			key: category.name,
			name: category.name.toLowerCase(),
			icon: { kind: "category" as const, name: category.name },
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
					icon: { kind: "sub" as const, id: subId as SubWeaponId },
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
				icon: { kind: "special" as const, id: specialId as SpecialWeaponId },
				weaponIds: weaponsWithSpecial,
			};
		})
		.filter((group) => group.weaponIds.length > 0);
}
