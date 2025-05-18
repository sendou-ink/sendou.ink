import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import { Image } from "./Image";

const sizeMap = {
	MAIN: 42,
	SUB: 32,
	SUBTINY: 26,
	TINY: 22,
} as const;

export function Ability({
	ability,
	size,
	dragStarted = false,
	dropAllowed = false,
	onClick,
	onDrop,
	className,
}: {
	ability: AbilityWithUnknown;
	size: keyof typeof sizeMap;
	dragStarted?: boolean;
	dropAllowed?: boolean;
	onClick?: () => void;
	onDrop?: (event: React.DragEvent) => void;
	className?: string;
}) {
	const { t } = useTranslation(["game-misc", "builds"]);
	const sizeNumber = sizeMap[size];

	const [isDragTarget, setIsDragTarget] = React.useState(false);

	const onDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		setIsDragTarget(true);
	};

	const onDragLeave = () => {
		setIsDragTarget(false);
	};

	const readonly = typeof onClick === "undefined" || ability === "UNKNOWN"; // Force "UNKNOWN" ability icons to be readonly

	// Render an ability as a button only if it is meant to be draggable (i.e., not readonly)
	const AbilityTag = readonly ? "div" : "button";

	const altText =
		ability !== "UNKNOWN"
			? t(`game-misc:ABILITY_${ability}`)
			: t("builds:emptyAbilitySlot");

	return (
		<AbilityTag
			className={clsx(
				"build__ability",
				{
					"is-drag-target": isDragTarget,
					"drag-started": dragStarted,
					"drop-allowed": dropAllowed,
					readonly,
				},
				className,
			)}
			style={{
				"--ability-size": `${sizeNumber}px`,
			}}
			onClick={onClick}
			data-testid={`${ability}-ability`}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={(event) => {
				setIsDragTarget(false);
				onDrop?.(event);
			}}
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
