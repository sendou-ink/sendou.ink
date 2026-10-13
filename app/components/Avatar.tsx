import clsx from "clsx";
import * as React from "react";
import { generateIdenticon } from "~/utils/identicon";
import type { CommonUser } from "~/utils/kysely.server";
import { avatarUrl } from "~/utils/urls";
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
	user?: Pick<CommonUser, "id" | "avatar">;
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

	const identiconSource =
		identiconInput ?? (user ? String(user.id) : "unknown");

	const userAvatarUrl = user?.avatar
		? avatarUrl(user.avatar, size === "lg" || size === "xmd" ? "lg" : "sm")
		: undefined;

	const imageUrl = url ?? userAvatarUrl;

	const src =
		imageUrl && !isErrored ? imageUrl : generateIdenticon(identiconSource);

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
