import clsx from "clsx";
import * as React from "react";
import type { Tables } from "~/db/tables";
import { generateIdenticon } from "~/utils/identicon";
import { resolveAvatarUrl } from "~/utils/urls";
import styles from "./Avatar.module.css";

const dimensions = {
	xxxs: 16,
	xxxsm: 20,
	xxs: 24,
	xxsm: 32,
	xs: 36,
	sm: 44,
	xsm: 62,
	md: 81,
	xmd: 94,
	lg: 125,
} as const;

export function Avatar({
	user,
	url,
	identiconInput,
	size = "sm",
	className,
	alt = "",
	loading = "lazy",
	...rest
}: {
	user?: Pick<Tables["User"], "discordId" | "discordAvatar"> & {
		customAvatarUrl?: string | null;
	};
	url?: string | null;
	identiconInput?: string;
	className?: string;
	alt?: string;
	size: keyof typeof dimensions;
	loading?: "lazy" | "eager";
} & React.ButtonHTMLAttributes<HTMLImageElement>) {
	const [isErrored, setIsErrored] = React.useState(false);

	// an <img> can finish loading (and fail) before React hydrates and attaches onError, so that
	// error is missed — re-check on mount and fall back manually so SSR'd avatars still heal
	const checkAlreadyErrored = (img: HTMLImageElement | null) => {
		if (img?.complete && img.naturalWidth === 0) setIsErrored(true);
	};

	const identiconSource = identiconInput ?? user?.discordId ?? "unknown";

	const userAvatarUrl = user
		? resolveAvatarUrl({
				customAvatarUrl: user.customAvatarUrl,
				discordId: user.discordId,
				discordAvatar: user.discordAvatar,
				size: size === "lg" || size === "xmd" ? "lg" : "sm",
			})
		: undefined;

	const avatarUrl = url ?? userAvatarUrl;

	const src =
		avatarUrl && !isErrored ? avatarUrl : generateIdenticon(identiconSource);

	return (
		<div className={clsx(styles.avatarWrapper, className)}>
			<img
				ref={checkAlreadyErrored}
				src={src}
				alt={alt}
				title={alt ? alt : undefined}
				width={dimensions[size]}
				height={dimensions[size]}
				loading={loading}
				onError={() => setIsErrored(true)}
				{...rest}
			/>
		</div>
	);
}
