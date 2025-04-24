import { useTranslation } from "react-i18next";
import {
	BadgeDisplay,
	type BadgeDisplayProps,
} from "~/features/badges/components/BadgeDisplay";

export function BadgesSelector({
	options,
	selectedBadges,
	onChange,
	onBlur,
}: {
	options: BadgeDisplayProps["badges"];
	selectedBadges: number[];
	onChange: (newBadges: number[]) => void;
	onBlur: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className="stack md">
			{selectedBadges.length > 0 ? (
				<BadgeDisplay
					badges={options.filter((badge) => selectedBadges.includes(badge.id))}
					onBadgeRemove={(badgeId) =>
						onChange(selectedBadges.filter((id) => id !== badgeId))
					}
					key={selectedBadges.join(",")}
				/>
			) : (
				<div className="text-lighter text-md font-bold">
					{t("common:badges.selector.none")}
				</div>
			)}
			<select
				onBlur={onBlur}
				onChange={(e) => onChange([Number(e.target.value), ...selectedBadges])}
			>
				<option>{t("common:badges.selector.select")}</option>
				{options
					.filter((badge) => !selectedBadges.includes(badge.id))
					.map((badge) => (
						<option key={badge.id} value={badge.id}>
							{badge.displayName}
						</option>
					))}
			</select>
		</div>
	);
}
