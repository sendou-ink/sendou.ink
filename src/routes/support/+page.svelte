<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { perks } from './perks';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { SENDOU_INK_PATREON_URL } from '$lib/utils/urls';
	import Main from '$lib/components/Main.svelte';
	import Check from '@lucide/svelte/icons/check';
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
					<!-- xxx: implement popover -->
					<!-- {#if perk.extraInfo}
						<SendouPopover>
							{#snippet trigger()}
								<SendouButton className="support__popover-trigger">?</SendouButton>
							{/snippet}
							{m[`support_perk_${perk.name}_extra`]()}
						</SendouPopover>
					{/if} -->
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

	<Button href={SENDOU_INK_PATREON_URL} size="big" class="mx-auto">
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
