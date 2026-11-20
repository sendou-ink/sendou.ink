import { SearchIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { OutlinedImage, WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { weaponCategoryUrl } from "~/utils/urls";
import type { Point } from "../core/PlanDocument";
import styles from "./WeaponPicker.module.css";

/** How far the pointer moves on a weapon, in pixels, before it counts as dragging it out instead of a click. */
const DRAG_START_DISTANCE = 5;
const LEFT_MOUSE_BUTTON = 0;

/**
 * A search field, focused when opened, above every weapon grouped by category. Enter picks the
 * first match. Weapons can also be dragged out, e.g. straight onto the map.
 */
export function WeaponPicker({
	currentWeaponId,
	onPick,
	onWeaponDragStart,
}: {
	currentWeaponId?: MainWeaponId;
	onPick: (weaponId: MainWeaponId) => void;
	/** The pointer pressed on a weapon moved far enough to drag it out, `clientPoint` being where it is now. */
	onWeaponDragStart: (weaponId: MainWeaponId, clientPoint: Point) => void;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const [search, setSearch] = React.useState("");

	const categories = weaponCategories
		.map((category) => ({
			name: category.name,
			weaponIds: (category.weaponIds as readonly MainWeaponId[]).filter(
				(weaponId) =>
					filterWeapon({
						weapon: { type: "MAIN", id: weaponId },
						weaponName: t(`weapons:MAIN_${weaponId}`),
						searchTerm: search.trim(),
					}),
			),
		}))
		.filter((category) => category.weaponIds.length > 0);

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return;

		event.preventDefault();
		const firstMatch = categories[0]?.weaponIds[0];
		if (firstMatch !== undefined) onPick(firstMatch);
	};

	return (
		<div className={styles.picker}>
			<label className={styles.search}>
				<SearchIcon className={styles.searchIcon} />
				<input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					onKeyDown={onKeyDown}
					placeholder={t("common:forms.weaponSearch.search.placeholder")}
					aria-label={t("common:forms.weaponSearch.search.placeholder")}
					data-autofocus
					data-testid="plan-weapon-search"
				/>
			</label>
			{categories.length === 0 ? (
				<p className={styles.noResults}>{t("common:noResults")}</p>
			) : null}
			<div className={styles.categories}>
				{categories.map((category) => (
					<div key={category.name} className={styles.category}>
						<OutlinedImage
							path={weaponCategoryUrl(category.name)}
							alt={t(`common:weapon.category.${category.name}`)}
							title={t(`common:weapon.category.${category.name}`)}
							size={28}
						/>
						<div className={styles.weapons}>
							{category.weaponIds.map((weaponId) => (
								<button
									key={weaponId}
									type="button"
									className={styles.weapon}
									aria-pressed={weaponId === currentWeaponId}
									onClick={() => onPick(weaponId)}
									// the pointer drag of trackDragStart, never the browser's own
									onDragStart={(event) => event.preventDefault()}
									onPointerDown={(event) =>
										trackDragStart(event, (clientPoint) =>
											onWeaponDragStart(weaponId, clientPoint),
										)
									}
									data-testid={`plan-weapon-${weaponId}`}
								>
									<WeaponImage
										weaponSplId={weaponId}
										variant="badge"
										size={36}
										// the same image as the dragged and placed token, which load it in CORS mode
										crossOrigin="anonymous"
									/>
								</button>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/** Calls `onDragStart` once the pressed pointer moves {@link DRAG_START_DISTANCE}, a release before that being a click. */
function trackDragStart(
	event: React.PointerEvent,
	onDragStart: (clientPoint: Point) => void,
) {
	if (event.button !== LEFT_MOUSE_BUTTON || event.pointerType === "touch") {
		return;
	}
	// no text selection while dragging
	event.preventDefault();

	const start: Point = [event.clientX, event.clientY];
	const onMove = (moveEvent: PointerEvent) => {
		const distance = Math.hypot(
			moveEvent.clientX - start[0],
			moveEvent.clientY - start[1],
		);
		if (distance < DRAG_START_DISTANCE) return;

		stop();
		onDragStart([moveEvent.clientX, moveEvent.clientY]);
	};
	const stop = () => {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", stop);
		window.removeEventListener("pointercancel", stop);
	};

	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", stop);
	window.addEventListener("pointercancel", stop);
}
