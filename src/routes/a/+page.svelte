<script lang="ts">
	import { resolve } from '$app/paths';
	import Main from '$lib/components/main.svelte';
	import OpenGraphMeta from '$lib/components/open-graph-meta.svelte';
	import { m } from '$lib/paraglide/messages';
	import { joinListToNaturalString } from '$lib/utils/arrays';

	import { allArticles } from './articles.remote';
</script>

<OpenGraphMeta
	title="Articles"
	ogTitle="Splatoon articles"
	description="Articles about the competitive side of Splatoon. Written by various community members."
/>

<Main class="stack lg">
	<ul class="articles-list">
		{#each await allArticles() as article (article.title)}
			<li>
				<a href={resolve(`/a/${article.slug}`)} class="title">
					{article.title}
				</a>
				<div class="text-xs text-lighter">
					{m.common_articles_by({
						author: joinListToNaturalString(
							article.authors.map((a) => a.name),
							'&'
						)
					})}
					• <time>{article.dateString}</time>
				</div>
			</li>
		{/each}
	</ul>
</Main>

<style>
	.articles-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: var(--s-6);
		list-style: none;
	}

	.title {
		color: var(--theme);
		font-size: var(--fonts-md);
		font-weight: var(--semi-bold);
	}
</style>
