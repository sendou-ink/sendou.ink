<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import { truncateBySentence } from '$lib/utils/strings';

	interface Props {
		/** Title as shown by the browser in the tab etc. Appended with "| sendou.ink"*/
		title: string;
		/** Title as shown when shared on Bluesky, Discord etc. Also used in search results. If omitted, "title" is used instead. */
		ogTitle?: string;
		/** Brief description of the page's contents used by search engines and social media sharing. If the description is over 300 characters long it is automatically truncated. */
		description?: string | null;
		/** Optionally override location pathname. */
		url?: string;
		image?: {
			url: string;
			dimensions?: {
				width: number;
				height: number;
			};
		};
	}

	let { title, ogTitle, description, url, image }: Props = $props();

	const ROOT_URL = 'https://sendou.ink';

	const pageTitle = $derived(title === 'sendou.ink' ? title : `${title} | sendou.ink`);

	const finalOgTitle = $derived(ogTitle ?? title);

	const truncatedDescription = $derived(description ? truncateBySentence(description, 300) : null);

	const pageUrl = $derived(url ?? page.url.pathname);

	const imageUrl = $derived.by(() => {
		if (image?.url.startsWith('http')) {
			return image.url;
		}

		if (image) {
			return `${ROOT_URL}${image.url}`;
		}

		return asset('/img/layout/common-preview.png');
	});

	const imageWidth = $derived(
		!image ? '1920' : image.dimensions ? String(image.dimensions.width) : undefined
	);

	const imageHeight = $derived(
		!image ? '1080' : image.dimensions ? String(image.dimensions.height) : undefined
	);
</script>

<svelte:head>
	<title>{pageTitle}</title>

	<meta property="og:title" content={finalOgTitle} />
	<meta property="og:site_name" content="sendou.ink" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{ROOT_URL}{pageUrl}" />
	<meta property="og:image" content={imageUrl} />

	{#if truncatedDescription}
		<meta name="description" content={truncatedDescription} />
		<meta property="og:description" content={truncatedDescription} />
	{/if}

	{#if imageWidth}
		<meta property="og:image:width" content={imageWidth} />
	{/if}

	{#if imageHeight}
		<meta property="og:image:height" content={imageHeight} />
	{/if}
</svelte:head>
