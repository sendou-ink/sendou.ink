import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { gameBadgeUrl } from "~/utils/urls";
import gameBadgeNames from "../../../../locales/en/game-badges.json";
import styles from "./GameBadgeSelectField.module.css";

const MIN_SEARCH_LENGTH = 2;

const BADGE_ENTRIES = Object.entries(gameBadgeNames as Record<string, string>);

export function GameBadgeSelectField({
	value,
	onChange,
	maxCount,
}: CustomFieldRenderProps<string[]> & { maxCount: number }) {
	const { t } = useTranslation(["user"]);
	const [search, setSearch] = useState("");

	const selectedIds = value ?? [];

	const filteredBadges =
		search.length >= MIN_SEARCH_LENGTH
			? BADGE_ENTRIES.filter(
					([id, name]) =>
						name.toLowerCase().includes(search.toLowerCase()) &&
						!selectedIds.includes(id),
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
					{selectedIds.map((id) => (
						<button
							key={id}
							type="button"
							className={styles.badgeButton}
							onClick={() => handleRemove(id)}
							title={(gameBadgeNames as Record<string, string>)[id]}
						>
							<img
								src={gameBadgeUrl(id)}
								alt={(gameBadgeNames as Record<string, string>)[id] ?? id}
								className={styles.badgeImage}
							/>
						</button>
					))}
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
					{filteredBadges.map(([id, name]) => (
						<button
							key={id}
							type="button"
							className={styles.badgeButton}
							onClick={() => handleAdd(id)}
							title={name}
						>
							<img
								src={gameBadgeUrl(id)}
								alt={name}
								className={styles.badgeImage}
							/>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
