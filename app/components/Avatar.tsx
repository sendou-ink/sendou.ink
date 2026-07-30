import clsx from "clsx";
import * as React from "react";
import type { Tables } from "~/db/tables";
import { useHydrated } from "~/hooks/useHydrated";
import { LRUCache } from "~/modules/cache";
import { BLANK_IMAGE_URL, discordAvatarUrl } from "~/utils/urls";
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

const identiconCache = new LRUCache<string, string>({ max: 500 });

function hashString(str: string) {
	let hash = 5381;

	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
	}

	return hash;
}

function generateColors(hash: number) {
	const hue = hash % 360;
	const saturation = 65 + ((hash >>> 8) % 20);
	const lightness = 50 + ((hash >>> 16) % 20);

	return {
		background: `hsl(${hue}, ${saturation - 50}%, ${lightness - 40}%)`,
		foreground: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
	};
}

export function generateIdenticon(input: string, size = 128, gridSize = 5) {
	const cacheKey = `${input}-${size}-${gridSize}`;
	const cached = identiconCache.get(cacheKey);
	if (cached) return cached;

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d")!;

	const dpr = window.devicePixelRatio || 1;
	canvas.width = size * dpr;
	canvas.height = size * dpr;
	canvas.style.width = `${size}px`;
	canvas.style.height = `${size}px`;
	ctx.scale(dpr, dpr);
	ctx.imageSmoothingEnabled = false;

	const insetRatio = 1 / Math.sqrt(2);
	const cellSize = Math.floor((size * insetRatio) / gridSize);
	const actualSize = cellSize * gridSize;
	const offset = Math.floor((size - actualSize) / 2);
	const halfGrid = Math.ceil(gridSize / 2);

	const patternHash = hashString(input);
	const colorHash = hashString(input.split("").reverse().join(""));

	const colors = generateColors(colorHash);
	ctx.fillStyle = colors.background;
	ctx.fillRect(0, 0, size, size);
	ctx.fillStyle = colors.foreground;

	const path = new Path2D();

	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < halfGrid; col++) {
			const bitIndex = row * halfGrid + col;
			const shouldFill = (patternHash >>> bitIndex) & 1;

			if (shouldFill) {
				const x = offset + col * cellSize;
				const y = offset + row * cellSize;

				path.rect(x, y, cellSize, cellSize);

				const mirrorCol = gridSize - 1 - col;
				if (col !== mirrorCol) {
					const mirrorX = offset + mirrorCol * cellSize;
					path.rect(mirrorX, y, cellSize, cellSize);
				}
			}
		}
	}

	ctx.fill(path);

	const dataUrl = canvas.toDataURL();
	identiconCache.set(cacheKey, dataUrl);
	return dataUrl;
}

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
	const isClient = useHydrated();

	// an <img> can finish loading (and fail) before React hydrates and attaches onError, so that
	// error is missed — re-check on mount and fall back manually so SSR'd avatars still heal
	const checkAlreadyErrored = (img: HTMLImageElement | null) => {
		if (img?.complete && img.naturalWidth === 0) setIsErrored(true);
	};

	const identiconSource = identiconInput ?? user?.discordId ?? "unknown";

	const src = url
		? url
		: user?.customAvatarUrl && !isErrored
			? user.customAvatarUrl
			: user?.discordAvatar && !isErrored
				? discordAvatarUrl({
						discordAvatar: user.discordAvatar,
						discordId: user.discordId,
						size: size === "lg" || size === "xmd" ? "lg" : "sm",
					})
				: isClient
					? generateIdenticon(identiconSource, dimensions[size], 7)
					: BLANK_IMAGE_URL;

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
