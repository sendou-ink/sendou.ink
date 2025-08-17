<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import * as AuthAPI from '$lib/api/auth';
	import * as UserAPI from '$lib/api/user';
	import { m } from '$lib/paraglide/messages';
	import Label from '$lib/components/form/Label.svelte';
	import { SMALL_BADGES_PER_DISPLAY_PAGE } from '$lib/api/user/schemas';
	import BadgesSelector from '$lib/components/badge/BadgesSelector.svelte';

	interface Props extends FormFieldProps<'custom'> {
		name: string;
		value: number[];
	}

	let { name, label, value = $bindable() }: Props = $props();

	$inspect(value);

	const loggedInUser = $derived(await AuthAPI.queries.me());
	const badges = $derived(await UserAPI.queries.allBadgesByMe());
	const isSupporter = $derived(loggedInUser?.roles.includes('SUPPORTER') ?? false);
</script>

<div>
	<input type="hidden" {name} value={JSON.stringify(value)} />
	<Label>{label}</Label>
	<BadgesSelector
		bind:selectedBadges={value}
		options={badges}
		maxCount={SMALL_BADGES_PER_DISPLAY_PAGE + 1}
		showSelect={isSupporter || value.length === 0}
	>
		{#if !isSupporter}
			<div class="text-sm text-lighter font-semi-bold text-center">
				{m.user_forms_favoriteBadges_nonSupporter()}
			</div>
		{/if}
	</BadgesSelector>
</div>
