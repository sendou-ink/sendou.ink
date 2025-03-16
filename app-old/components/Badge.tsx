import { badgeUrl } from "~/utils/urls";
import { Image } from "./Image";

export function Badge({
	badge,
	onClick,
	isAnimated,
	size,
}: {
	badge: { displayName: string; hue?: number | null; code: string };
	onClick?: () => void;
	isAnimated: boolean;
	size: number;
}) {
	const commonProps = {
		title: badge.displayName,
		onClick,
		width: size,
		height: size,
		style: badge.hue ? { filter: `hue-rotate(${badge.hue}deg)` } : undefined,
	};

	if (isAnimated) {
		return (
			// biome-ignore lint/a11y/useAltText: false positive..?
			<img
				src={badgeUrl({ code: badge.code, extension: "gif" })}
				alt={badge.displayName}
				{...commonProps}
			/>
		);
	}

	return (
		<Image
			path={badgeUrl({ code: badge.code })}
			alt={badge.displayName}
			loading="lazy"
			{...commonProps}
		/>
	);
}
