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
	children,
	maxCount,
	showSelect = true,
}: {
	options: BadgeDisplayProps["badges"];
	selectedBadges: number[];
	onChange: (newBadges: number[]) => void;
	onBlur?: () => void;
	children?: React.ReactNode;
	maxCount?: number;
	showSelect?: boolean;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className="stack md">
			{selectedBadges.length > 0 ? (
				<BadgeDisplay
					badges={options
						.filter((badge) => selectedBadges.includes(badge.id))
						.sort((a, b) => {
							const aIdx = selectedBadges.indexOf(a.id);
							const bIdx = selectedBadges.indexOf(b.id);

							return aIdx - bIdx;
						})}
					onChange={onChange}
					key={selectedBadges.join(",")}
				>
					{children}
				</BadgeDisplay>
			) : (
				<div className="text-lighter text-md font-bold">
					{t("common:badges.selector.none")}
				</div>
			)}
			{showSelect ? (
				options.length === 0 ? (
					<div className="text-warning text-xs">
						{t("common:badges.selector.noneAvailable")}
					</div>
				) : (
					<select
						onBlur={() => onBlur?.()}
						onChange={(e) =>
							onChange([...selectedBadges, Number(e.target.value)])
						}
						disabled={Boolean(maxCount && selectedBadges.length >= maxCount)}
						data-testid="badges-selector"
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
				)
			) : null}
		</div>
	);
}
