<script lang="ts">
	import Main from '$lib/components/main.svelte';
	import Markdown from '$lib/components/markdown.svelte';
	import OpenGraphMeta from '$lib/components/open-graph-meta.svelte';
	import { articlePreviewUrl } from '$lib/utils/urls';
	import { articleBySlug, type ArticleBySlugData } from '../articles.remote';

	const { params } = $props();

	const article = $derived(await articleBySlug(params.slug));
</script>

<OpenGraphMeta
	title={article.title}
	description={article.content.trim().split('\n')[0]}
	image={{
		url: articlePreviewUrl(params.slug)
	}}
/>

<Main>
	<article>
		<h1>{article.title}</h1>
		<div class="text-sm text-lighter">
			by {@render authors(article.authors)} • <time>{article.dateString}</time>
		</div>
		<!-- xxx: add markdown -->
		<Markdown content={article.content} />
	</article>
</Main>

{#snippet authors(authors: ArticleBySlugData['authors'])}
	{#each authors as author, i (author.name)}
		{#if !author.link}
			{author.name}
		{:else}
			{@const authorLink = author.link.includes('https://sendou.ink')
				? author.link.replace('https://sendou.ink', '')
				: author.link}

			{#if author.link.includes('https://sendou.ink')}
				<a href={authorLink}>{author.name}</a>
			{:else}
				<a href={author.link}>{author.name}</a>
			{/if}
		{/if}
		{#if i < authors.length - 1}
			&
		{/if}
	{/each}
{/snippet}

<style>
	a {
		font-weight: var(--semi-bold);
		color: var(--theme);
	}
</style>
