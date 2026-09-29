import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import styles from "./Ability.module.css";
import { Image } from "./Image";

const sizeMap = {
	HUGE: 64,
	MAIN: 42,
	SUB: 32,
	SUBTINY: 26,
	TINY: 22,
} as const;

export function Ability({
	ability,
	size,
	onClick,
	className,
}: {
	ability: AbilityWithUnknown;
	size: keyof typeof sizeMap;
	onClick?: () => void;
	className?: string;
}) {
	const { t } = useTranslation(["game-misc", "builds"]);
	const sizeNumber = sizeMap[size];

	const readonly = typeof onClick === "undefined" || ability === "UNKNOWN"; // Force "UNKNOWN" ability icons to be readonly

	const AbilityTag = readonly ? "div" : "button";

	const altText =
		ability !== "UNKNOWN"
			? t(`game-misc:ABILITY_${ability}`)
			: t("builds:emptyAbilitySlot");

	return (
		<AbilityTag
			className={clsx(
				styles.ability,
				{
					[styles.readonly]: readonly,
				},
				className,
			)}
			style={{
				"--ability-size": `${sizeNumber}px`,
			}}
			onClick={onClick}
			data-testid={`${ability}-ability`}
			type={readonly ? undefined : "button"}
		>
			<Image
				alt={altText}
				title={altText}
				path={abilityImageUrl(ability)}
				size={sizeNumber}
			/>
		</AbilityTag>
	);
}
