<script lang="ts">
	import { page } from '$app/state';
	import { navIconUrl } from '$lib/utils/urls';
	import Image from '../image/Image.svelte';

	interface Breadcrumb {
		image: string;
		url: string;
	}

	let routes = $derived(page.route.id?.split(/(?<!\))\//).filter(Boolean) || []);
	let paths = $derived(page.url.pathname.split('/').filter(Boolean));

	let crumbs = $derived.by<Breadcrumb[]>(() => {
		let crumbs: Breadcrumb[] = [];
		let fullPath = '';

		for (let i = 0; i < routes.length; i++) {
			const route = routes[i];
			const path = paths[i];

			fullPath += `/${path}`;

			if (route.includes('(') || route.includes('[')) continue;

			crumbs.push({
				image: navIconUrl(route),
				url: fullPath
			});
		}

		return crumbs;
	});
</script>

<div class="breadcrumb-container">
	<a href="/" class="breadcrumb logo"> sendou.ink </a>
	{#each crumbs as crumb (crumb.url)}
		<span class="separator">»</span>
		<a href={crumb.url} class="breadcrumb">
			<Image path={crumb.image} width={24} height={24} />
		</a>
	{/each}
</div>

<style>
	.breadcrumb-container {
		display: flex;
		height: calc(var(--layout-nav-height) / 2);
		align-items: center;
		gap: var(--s-2);
	}

	.breadcrumb {
		overflow: hidden;
		max-width: 350px;
		color: var(--color-base-content);
		font-size: var(--fonts-xs);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1rem;

		&.logo {
			overflow: initial;
		}

		&:focus-visible {
			outline: 2px solid var(--color-primary);
			outline-offset: 2px;
			border-radius: var(--radius-box);
		}
	}

	.separator {
		color: var(--color-base-content-secondary);
		opacity: 0.75;
		font-size: 20px;
	}
</style>
