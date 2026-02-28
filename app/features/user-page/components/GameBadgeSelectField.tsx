import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CustomFieldRenderProps } from "~/form/FormField";
import {
	GAME_BADGE_IDS,
	type GameBadgeId,
} from "~/modules/in-game-lists/game-badge-ids";
import { gameBadgeUrl } from "~/utils/urls";
import styles from "./GameBadgeSelectField.module.css";

const MIN_SEARCH_LENGTH = 2;

export function GameBadgeSelectField({
	value,
	onChange,
	maxCount,
}: CustomFieldRenderProps<string[]> & { maxCount: number }) {
	const { t } = useTranslation(["user", "game-badges"]);
	const [search, setSearch] = useState("");

	const selectedIds = value ?? [];

	const filteredBadges =
		search.length >= MIN_SEARCH_LENGTH
			? GAME_BADGE_IDS.filter(
					(id) =>
						t(`game-badges:${id}`)
							.toLowerCase()
							.includes(search.toLowerCase()) && !selectedIds.includes(id),
				)
			: [];

	const handleAdd = (id: string) => {
		if (selectedIds.length >= maxCount) return;
		if (selectedIds.includes(id)) return;
		onChange([...selectedIds, id]);
	};

	const handleRemove = (id: string) => {
		onChange(selectedIds.filter((selectedId) => selectedId !== id));
	};

	return (
		<div className={styles.container}>
			<div>
				<label>{t("user:widgets.forms.gameBadges")}</label>
				<div className={styles.selectedBadges}>
					{selectedIds.map((id) => {
						const badgeId = id as GameBadgeId;
						return (
							<button
								key={id}
								type="button"
								className={styles.badgeButton}
								onClick={() => handleRemove(id)}
								title={t(`game-badges:${badgeId}`)}
							>
								<img
									src={gameBadgeUrl(id)}
									alt={t(`game-badges:${badgeId}`)}
									className={styles.badgeImage}
								/>
							</button>
						);
					})}
					<span className={styles.count}>
						{selectedIds.length}/{maxCount}
					</span>
				</div>
			</div>

			<input
				type="text"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder={t("user:widgets.forms.gameBadgesSearch")}
				className={styles.searchInput}
			/>

			{filteredBadges.length > 0 ? (
				<div className={styles.resultsGrid}>
					{filteredBadges.map((id) => (
						<button
							key={id}
							type="button"
							className={styles.badgeButton}
							onClick={() => handleAdd(id)}
							title={t(`game-badges:${id}`)}
						>
							<img
								src={gameBadgeUrl(id)}
								alt={t(`game-badges:${id}`)}
								className={styles.badgeImage}
							/>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
