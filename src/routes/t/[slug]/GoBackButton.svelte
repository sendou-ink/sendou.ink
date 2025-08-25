<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import * as TeamAPI from '$lib/api/team';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	const { team } = $derived(await TeamAPI.queries.bySlug(slug));
</script>

<div class="stack">
	<Button
		href={resolve('/t/[slug]', { slug: team.customUrl })}
		icon={ArrowLeft}
		variant="outlined"
		size="small"
		class="mr-auto"
	>
		{m.common_actions_back()}
	</Button>
</div>
