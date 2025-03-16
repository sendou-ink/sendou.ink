import clsx from "clsx";
import * as React from "react";
import type { User } from "~/db/types";
import { BLANK_IMAGE_URL, discordAvatarUrl } from "~/utils/urls";

const dimensions = {
	xxxs: 16,
	xxs: 24,
	xs: 36,
	sm: 44,
	xsm: 62,
	md: 81,
	lg: 125,
} as const;

function _Avatar({
	user,
	url,
	size = "sm",
	className,
	alt = "",
	...rest
}: {
	user?: Pick<User, "discordId" | "discordAvatar">;
	url?: string;
	className?: string;
	alt?: string;
	size: keyof typeof dimensions;
} & React.ButtonHTMLAttributes<HTMLImageElement>) {
	const [isErrored, setIsErrored] = React.useState(false);
	// TODO: just show text... my profile?
	// TODO: also show this if discordAvatar is stale and 404's

	// biome-ignore lint/correctness/useExhaustiveDependencies: every avatar error state is unique and we want to avoid using key on every avatar
	React.useEffect(() => {
		setIsErrored(false);
	}, [user?.discordAvatar]);

	const src =
		url ??
		(user?.discordAvatar && !isErrored
			? discordAvatarUrl({
					discordAvatar: user.discordAvatar,
					discordId: user.discordId,
					size: size === "lg" ? "lg" : "sm",
				})
			: BLANK_IMAGE_URL); // avoid broken image placeholder

	return (
		// biome-ignore lint/a11y/useAltText: spread messes it up https://github.com/biomejs/biome/issues/3081
		<img
			className={clsx("avatar", className)}
			src={src}
			alt={alt}
			title={alt ? alt : undefined}
			width={dimensions[size]}
			height={dimensions[size]}
			onError={() => setIsErrored(true)}
			{...rest}
		/>
	);
}

export const Avatar = React.memo(_Avatar);
