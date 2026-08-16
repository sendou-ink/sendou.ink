<script lang="ts">
import { Config } from "#lib/config.ts";
import { truncateBySentence } from "#lib/utils/strings.ts";
import { page } from "$app/state";

interface Props {
	title: string;
	ogTitle?: string;
	description?: string;
	url?: string;
	image?: { url: string; dimensions?: { width: number; height: number } };
}

let { title, ogTitle, description, url, image }: Props = $props();

const ROOT_URL = "https://sendou.ink";
const COMMON_PREVIEW_IMAGE = `${Config.staticAssetsUrl}/img/layout/common-preview.png`;

const fullTitle = $derived(
	title === "sendou.ink" ? title : `${title} | sendou.ink`,
);
const truncatedDescription = $derived(
	description ? truncateBySentence(description, 300) : null,
);
const ogUrl = $derived(`${ROOT_URL}${url ?? page.url.pathname}`);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta property="og:title" content={ogTitle ?? title} />
	{#if truncatedDescription}
		<meta name="description" content={truncatedDescription} />
		<meta property="og:description" content={truncatedDescription} />
	{/if}
	<meta property="og:site_name" content="sendou.ink" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={ogUrl} />
	<meta property="og:image" content={image?.url ?? COMMON_PREVIEW_IMAGE} />
	{#if !image}
		<meta property="og:image:width" content="1920" />
		<meta property="og:image:height" content="1080" />
	{:else if image.dimensions}
		<meta property="og:image:width" content={String(image.dimensions.width)} />
		<meta property="og:image:height" content={String(image.dimensions.height)} />
	{/if}
</svelte:head>
