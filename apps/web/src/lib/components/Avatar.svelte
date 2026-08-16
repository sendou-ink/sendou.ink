<script lang="ts" module>
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

const identiconCache = new Map<string, string>();
const IDENTICON_CACHE_MAX = 500;

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
	if (identiconCache.size >= IDENTICON_CACHE_MAX) {
		identiconCache.clear();
	}
	identiconCache.set(cacheKey, dataUrl);
	return dataUrl;
}
</script>

<script lang="ts">
	import { browser } from "$app/env";
	import { BLANK_IMAGE_URL, resolveAvatarUrl } from "#lib/utils/urls.ts";

	interface Props {
		user?: {
			discordId: string;
			discordAvatar: string | null;
			customAvatarUrl?: string | null;
		};
		url?: string | null;
		identiconInput?: string;
		class?: string;
		alt?: string;
		size?: keyof typeof dimensions;
		loading?: "lazy" | "eager";
	}

	let {
		user,
		url,
		identiconInput,
		size = "sm",
		class: className,
		alt = "",
		loading = "lazy",
	}: Props = $props();

	let isErrored = $state(false);

	// an <img> can finish loading (and fail) before hydration attaches onerror, so that
	// error is missed — re-check on mount and fall back manually so SSR'd avatars still heal
	function checkAlreadyErrored(img: HTMLImageElement) {
		if (img.complete && img.naturalWidth === 0) isErrored = true;
	}

	const identiconSource = $derived(
		identiconInput ?? user?.discordId ?? "unknown",
	);

	const userAvatarUrl = $derived(
		user
			? resolveAvatarUrl({
					customAvatarUrl: user.customAvatarUrl,
					discordId: user.discordId,
					discordAvatar: user.discordAvatar,
					size: size === "lg" || size === "xmd" ? "lg" : "sm",
				})
			: undefined,
	);

	const avatarUrl = $derived(url ?? userAvatarUrl);

	const src = $derived(
		avatarUrl && !isErrored
			? avatarUrl
			: browser
				? generateIdenticon(identiconSource, dimensions[size], 7)
				: BLANK_IMAGE_URL,
	);
</script>

<div class={["avatarWrapper", className]}>
	<img
		{src}
		{alt}
		title={alt ? alt : undefined}
		width={dimensions[size]}
		height={dimensions[size]}
		{loading}
		onerror={() => {
			isErrored = true;
		}}
		{@attach checkAlreadyErrored}
	/>
</div>

<style>
	.avatarWrapper {
		flex-shrink: 0;
		width: fit-content;
		height: fit-content;
		background-color: var(--color-bg-higher);
		border-radius: var(--radius-avatar);
		overflow: hidden;

		& img {
			display: block;
		}
	}
</style>
