<script lang="ts">
	import Main from '$lib/components/main.svelte';
	import OpenGraphMeta from '$lib/components/open-graph-meta.svelte';
	import { m } from '$lib/paraglide/messages';

	const questionsAndAnswers = [
		{
			q: m.faq_q1(),
			a: m.faq_a1()
		},
		{
			q: m.faq_q2(),
			a: m.faq_a2()
		},
		{
			q: m.faq_q3(),
			a: m.faq_a3()
		},
		{
			q: m.faq_q4(),
			a: m.faq_a4()
		},
		{
			q: m.faq_q5(),
			a: m.faq_a5()
		},
		{
			q: m.faq_q6(),
			a: m.faq_a6()
		},
		{
			q: m.faq_q7(),
			a: m.faq_a7()
		},
		{
			q: m.faq_q8(),
			a: m.faq_a8()
		},
		{
			q: m.faq_q9(),
			a: m.faq_a9()
		}
	];
</script>

<OpenGraphMeta title="FAQ" description="Frequently asked questions" />

<Main class="stack md">
	{#each questionsAndAnswers as { q: question, a: answer } (question)}
		<details>
			<summary>
				{question}
			</summary>
			<p>
				<!-- eslint-disable svelte/no-at-html-tags -->
				{@html answer}
			</p>
		</details>
	{/each}
</Main>

<style>
	summary {
		padding: var(--s-3);
		border-radius: var(--rounded);
		background-color: var(--bg-lighter);
		font-size: var(--fonts-lg);
		font-weight: var(--bold);
	}

	p {
		margin-inline: var(--s-4);
		padding-block: var(--s-3);
		white-space: pre-line;
	}
</style>
