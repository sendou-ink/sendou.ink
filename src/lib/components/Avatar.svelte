<script lang="ts">
	import { discordAvatarUrl } from '$lib/utils/urls';
	import type { Tables } from '$lib/server/db/tables';
	import type { HTMLImgAttributes } from 'svelte/elements';
	import { asset } from '$app/paths';

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

		if (user && !isErrored) {
			return discordAvatarUrl(user, size);
		}

		return asset('/img/blank.gif');
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
		background-color: var(--color-base-card-section);
	}
</style>
