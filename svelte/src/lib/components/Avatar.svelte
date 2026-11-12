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
</script>

<script lang="ts">
import type { Attachment } from "svelte/attachments";
import type { ClassValue } from "svelte/elements";
import { generateIdenticon } from "~/utils/identicon";
import type { CommonUser } from "~/utils/kysely.server";
import { avatarUrl, smallImageUrl } from "~/utils/urls";

interface Props {
	user?: Pick<CommonUser, "id" | "avatar">;
	/** An image other than a user's avatar, e.g. a team's logo. */
	url?: string | null;
	/** What the fallback identicon is generated from when there's no user. */
	identiconInput?: string;
	size?: keyof typeof dimensions;
	class?: ClassValue;
	alt?: string;
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

const isLarge = $derived(size === "lg" || size === "xmd");
const imageUrl = $derived.by(() => {
	if (url) return isLarge ? url : smallImageUrl(url);
	return user?.avatar ? avatarUrl(user.avatar, isLarge ? "lg" : "sm") : undefined;
});
const src = $derived(
	imageUrl && !isErrored
		? imageUrl
		: generateIdenticon(identiconInput ?? (user ? String(user.id) : "unknown")),
);

// an <img> can finish loading (and fail) before hydration attaches onerror, so that
// error is missed — re-check on mount and fall back manually so SSR'd avatars still heal
const checkAlreadyErrored: Attachment<HTMLImageElement> = (img) => {
	if (img.complete && img.naturalWidth === 0) isErrored = true;
};
</script>

<div class={["avatar-wrapper", className]}>
	<img
		{@attach checkAlreadyErrored}
		{src}
		{alt}
		title={alt ? alt : undefined}
		width={dimensions[size]}
		height={dimensions[size]}
		{loading}
		onerror={() => {
			isErrored = true;
		}}
	/>
</div>

<style>
	@layer components {
		.avatar-wrapper {
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
	}
</style>
