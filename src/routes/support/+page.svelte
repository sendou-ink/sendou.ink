<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { perks } from './perks';
	import Badge from '$lib/components/badge/Badge.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import Check from '@lucide/svelte/icons/check';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';
</script>

<OpenGraphMeta
	title="Support"
	description="Support Sendou's work on Patreon and get perks on sendou.ink"
/>

<Main class="stack lg">
	<div class="stack md">
		<p>{m.common_support_intro_first()}</p>
		<p>{m.common_support_intro_second()}</p>

		<div class="table">
			<div></div>
			<div>Support</div>
			<div>Supporter</div>
			<div>Supporter+</div>

			{#each perks as perk (perk.id)}
				<div class="justify-self-start">
					{perk.name}
					{#if perk.extraInfo}
						<Popover>
							{#snippet trigger()}
								<PopoverTriggerButton variant="minimal" class="inline-important ml-1" size="big"
									>?</PopoverTriggerButton
								>
							{/snippet}
							{perk.extraInfo}
						</Popover>
					{/if}
				</div>
				<div>
					{#if perk.tier === 1}
						<Check class="checkmark" />
					{/if}
				</div>
				{#if perk.id === 'badge'}
					<div>
						<Badge isAnimated badge={{ code: 'patreon', displayName: '' }} size={32} />
					</div>
				{:else}
					<div>
						{#if perk.tier <= 2}
							<Check class="checkmark" />
						{/if}
					</div>
				{/if}
				{#if perk.id === 'badge'}
					<div>
						<Badge
							isAnimated
							badge={{
								code: 'patreon_plus',
								displayName: ''
							}}
							size={32}
						/>
					</div>
				{:else}
					<div>
						{#if perk.tier <= 3}
							<Check class="checkmark" />
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<Button href="https://patreon.com/sendou" size="big" class="mx-auto">
		{m.common_support_action()}
	</Button>

	<!-- xxx: add footer -->
	<!-- <p class="text-sm text-lighter">
		{m.support_footer_before_link()}
		<a href={PATREON_HOW_TO_CONNECT_DISCORD_URL} target="_blank" rel="noreferrer">
			{m.support_footer_link_text()}
		</a>
		{m.support_footer_after_link()}
	</p>  -->
</Main>

<style>
	.table {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		place-items: center;
		font-size: var(--fonts-sm);
		row-gap: var(--s-2);
	}

	.table :global(.checkmark) {
		color: var(--color-success);
		width: 25px;
	}
</style>
