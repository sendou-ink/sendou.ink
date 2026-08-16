import { useTranslation } from "react-i18next";
import { ordinalSuffix } from "~/utils/i18n";
import {
	FIRST_PLACEMENT_ICON_PATH,
	SECOND_PLACEMENT_ICON_PATH,
	THIRD_PLACEMENT_ICON_PATH,
} from "~/utils/urls";

export type PlacementProps = {
	placement: number;
	iconClassName?: string;
	textClassName?: string;
	size?: number;
	textOnly?: boolean;
	/** Render plain text, no icon or wrapping html elements */
	plain?: boolean;
	showAsSuperscript?: boolean;
};

const getSpecialPlacementIconPath = (placement: number): string | null => {
	switch (placement) {
		case 3:
			return THIRD_PLACEMENT_ICON_PATH;
		case 2:
			return SECOND_PLACEMENT_ICON_PATH;
		case 1:
			return FIRST_PLACEMENT_ICON_PATH;
		default:
			return null;
	}
};

export function Placement({
	placement,
	iconClassName,
	textClassName,
	size = 20,
	textOnly = false,
	showAsSuperscript = true,
	plain = false,
}: PlacementProps) {
	const { i18n } = useTranslation();

	const suffix = ordinalSuffix(placement, i18n.language);
	const isSuperscript = showAsSuperscript && suffix.startsWith("^");
	const ordinalSuffixText = suffix.replace(/^\^/, "");

	const iconPath = textOnly ? null : getSpecialPlacementIconPath(placement);

	if (plain) {
		return `${placement}${ordinalSuffixText}`;
	}

	if (!iconPath) {
		return (
			<span className={textClassName}>
				{placement}
				{isSuperscript ? <sup>{ordinalSuffixText}</sup> : ordinalSuffixText}
			</span>
		);
	}

	const placementString = `${placement}${ordinalSuffixText}`;

	return (
		<img
			alt={placementString}
			title={placementString}
			src={iconPath}
			className={iconClassName}
			height={size}
			width={size}
		/>
	);
}
