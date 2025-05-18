import { useTranslation } from "react-i18next";
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
}: PlacementProps) {
	const { t } = useTranslation(undefined, {});

	// Remove assertion if types stop claiming result is "never".
	const ordinalSuffix: string = t("results.placeSuffix", {
		count: placement,
		ordinal: true,
		// no suffix is a better default than english
		defaultValue: "",
		fallbackLng: [],
	});

	const isSuperscript = showAsSuperscript && ordinalSuffix.startsWith("^");
	const ordinalSuffixText = ordinalSuffix.replace(/^\^/, "");

	const iconPath = textOnly ? null : getSpecialPlacementIconPath(placement);

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
