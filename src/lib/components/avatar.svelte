<script lang="ts">
	import type { Tables } from '$lib/server/db/tables';
	import { BLANK_IMAGE_URL, discordAvatarUrl } from '$lib/utils/urls';
	import type { HTMLImgAttributes } from 'svelte/elements';

	const dimensions = {
		xxxs: 16,
		xxs: 24,
		xs: 36,
		sm: 44,
		xsm: 62,
		md: 81,
		lg: 125
	} as const;

	interface Props extends HTMLImgAttributes {
		user?: Pick<Tables['User'], 'discordId' | 'discordAvatar'>;
		url?: string;
		size: keyof typeof dimensions;
	}

	let { user, url, size = 'sm', class: className, ...rest }: Props = $props();

	let isErrored = $state(false);

	const src = $derived.by(() => {
		if (url) return url;

		if (user?.discordAvatar && !isErrored) {
			return discordAvatarUrl({
				discordAvatar: user.discordAvatar,
				discordId: user.discordId,
				size: size === 'lg' ? 'lg' : 'sm'
			});
		}

		return BLANK_IMAGE_URL;
	});
</script>

<img
	class={['avatar', className]}
	width={dimensions[size]}
	height={dimensions[size]}
	onerror={() => (isErrored = true)}
	{src}
	{...rest}
/>

<style>
	.avatar {
		border-radius: 50%;
		background-color: var(--bg-lightest);
	}
</style>
