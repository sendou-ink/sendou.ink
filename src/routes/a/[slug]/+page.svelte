<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import * as ArticleAPI from '$lib/api/article';

	const { params } = $props();

	const article = $derived(await ArticleAPI.queries.bySlug(params.slug));
</script>

<OpenGraphMeta
	title={article.title}
	description={article.content.trim().split('\n')[0]}
	image={{
		url: `/img/article-previews/${params.slug}.png`
	}}
/>

<Main>
	<article>
		<h1>{article.title}</h1>
		<div class="text-sm text-lighter">
			by {@render authors()} • <time>{article.dateString}</time>
		</div>
		<Markdown content={article.content} />
	</article>
</Main>

{#snippet authors()}
	{#each article.authors as author, i (author.name)}
		{#if !author.link}
			{author.name}
		{:else}
			{@const authorLink = author.link.includes('https://sendou.ink')
				? author.link.replace('https://sendou.ink', '')
				: author.link}

			{#if author.link.includes('https://sendou.ink')}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={authorLink}>{author.name}</a>
			{:else}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
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
