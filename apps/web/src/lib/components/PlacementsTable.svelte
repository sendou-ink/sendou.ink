<script module lang="ts">
import type { Snippet } from "svelte";
import type { TierName } from "#lib/features/mmr/mmr-constants.ts";
import TierImage from "./TierImage.svelte";

export { placementDivider, placementName, placementRow, placementTierHeader };

interface PlacementRowArgs {
	rank: number | null;
	power: string | number;
	href?: string;
	children: Snippet;
	end?: Snippet;
}
</script>

<script lang="ts">
interface Props {
	children: Snippet;
}

let { children }: Props = $props();
</script>

<div class="table">
	{@render children()}
</div>

{#snippet placementRow({ rank, power, href, children, end }: PlacementRowArgs)}
	{#if href}
		<a {href} class="tableRow">
			{@render placementRowInner({ rank, power, children, end })}
		</a>
	{:else}
		<div class="tableRow">
			{@render placementRowInner({ rank, power, children, end })}
		</div>
	{/if}
{/snippet}

{#snippet placementRowInner({
	rank,
	power,
	children,
	end,
}: Omit<PlacementRowArgs, "href">)}
	<div class="tableInnerRow">
		<div class="tableRank">{rank}</div>
		{@render children()}
		<div class="tablePower">{power}</div>
		{@render end?.()}
	</div>
{/snippet}

{#snippet placementName(name: string)}
	<div class="tableName">{name}</div>
{/snippet}

{#snippet placementTierHeader(tier: { name: TierName; isPlus: boolean })}
	<div class="tierHeader">
		<TierImage {tier} width={32} />
		{tier.name}{tier.isPlus ? "+" : ""}
	</div>
{/snippet}

{#snippet placementDivider(children: Snippet)}
	<div class="tableRow tableRowQualification">
		{@render children()}
	</div>
{/snippet}

<style>
	.table {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
	}

	.tableRow {
		background-color: var(--color-bg-high);
		display: flex;
		padding: var(--s-2) var(--s-3);
		align-items: center;
		justify-content: space-between;
		color: var(--color-text);
		transition: 0.1s ease-in-out background-color;
		border-radius: 0;

		&:first-of-type {
			border-radius: var(--radius-box) var(--radius-box) 0 0;
		}

		&:last-of-type {
			border-radius: 0 0 var(--radius-box) var(--radius-box);
		}

		&:only-child {
			border-radius: var(--radius-box);
		}
	}

	a.tableRow:hover {
		background-color: var(--color-bg-higher);
	}

	.tableRowQualification {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		justify-content: center;
		background-color: var(--color-bg-higher);
		display: flex;
		gap: var(--s-2);
	}

	.tableInnerRow {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
	}

	.tableRank {
		min-width: 28px;
		text-align: right;
	}

	.tableName {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		max-width: 117px;
	}

	.tablePower {
		margin-inline-start: auto;
	}

	.tierHeader {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin-block: var(--s-2);
		color: var(--color-text-high);
	}

	.tableInnerRow :global(.tableWeapon) {
		background-color: var(--color-bg);
		border-radius: 100%;
	}

	.tableInnerRow :global(.avatar) {
		min-width: 24px;
		min-height: 24px;
	}
</style>
