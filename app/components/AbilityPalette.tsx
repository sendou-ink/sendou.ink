import clsx from "clsx";
import {
	HatGlasses,
	Layers,
	type LucideIcon,
	Shirt,
	SportShoe,
} from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability as AbilityName,
	AbilityType,
} from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import styles from "./AbilityPalette.module.css";
import { Image } from "./Image";

const PALETTE_GROUPS: PaletteGroup[] = [
	{ type: "STACKABLE", label: "Stackable abilities", Icon: Layers },
	{
		type: "HEAD_MAIN_ONLY",
		label: "Headgear-only abilities",
		Icon: HatGlasses,
	},
	{ type: "CLOTHES_MAIN_ONLY", label: "Clothing-only abilities", Icon: Shirt },
	{ type: "SHOES_MAIN_ONLY", label: "Shoes-only abilities", Icon: SportShoe },
];

interface PaletteGroup {
	type: AbilityType;
	label: string;
	Icon: LucideIcon;
}

/** Every ability grouped into rows by type (stackable, then the main-only abilities per gear piece). */
export function AbilityPalette({
	renderAbility,
}: {
	/** Renders one ability's button, typically an `<AbilityPaletteButton />`. */
	renderAbility: (ability: AbilityName) => React.ReactNode;
}) {
	return (
		<div className={styles.palette}>
			{PALETTE_GROUPS.map((group) => (
				<fieldset
					key={group.type}
					aria-label={group.label}
					className={styles.paletteGroup}
				>
					<span aria-hidden className={styles.rowMarker}>
						<group.Icon size={22} strokeWidth={2.5} />
					</span>
					{abilities
						.filter((ability) => ability.type === group.type)
						.map((ability) => renderAbility(ability.name))}
				</fieldset>
			))}
		</div>
	);
}

/**
 * Ability icon button for an `<AbilityPalette />`. `aria-disabled` greys it out (it stays focusable),
 * `aria-pressed` marks it selected.
 */
export function AbilityPaletteButton({
	ability,
	className,
	onClick,
	ref,
	...rest
}: Omit<React.ComponentPropsWithRef<"button">, "children"> & {
	ability: AbilityName;
}) {
	const { t } = useTranslation(["game-misc"]);
	const name = t(`game-misc:ABILITY_${ability}`);
	const isDisabled =
		rest["aria-disabled"] === true || rest["aria-disabled"] === "true";

	return (
		<button
			ref={ref}
			type="button"
			className={clsx(styles.abilityButton, className)}
			aria-label={name}
			title={name}
			onClick={isDisabled ? undefined : onClick}
			data-testid={`${ability}-ability-button`}
			{...rest}
		>
			<Image alt="" path={abilityImageUrl(ability)} width={32} height={32} />
		</button>
	);
}
