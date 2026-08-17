<script lang="ts">
import type { Snippet } from "svelte";
import { m } from "#lib/paraglide/messages.js";

/**
 * The card chrome shared by `ScrimPostCard` and `ScrimRequestCard`; owns the
 * styles the React cards shared through one CSS module.
 */
interface Props {
	isRequestCard?: boolean;
	isPickup: boolean;
	teamName: string;
	ownerUsername: string;
	avatar: Snippet;
	rightIcons?: Snippet;
	children?: Snippet;
	footerClass?: "requestFooter" | "filteredFooter";
	footer?: Snippet;
	showFooter?: boolean;
}

let {
	isRequestCard = false,
	isPickup,
	teamName,
	ownerUsername,
	avatar,
	rightIcons,
	children,
	footerClass,
	footer,
	showFooter = true,
}: Props = $props();
</script>

<div class={["card", { requestCard: isRequestCard }]}>
	<div class="header">
		<div class="avatarContainer">
			{@render avatar()}
		</div>
		<h3 class="teamName">
			{#if isPickup}
				<span class="pickupLabel">{m.scrims_pickupBy()}</span>
				<span>{ownerUsername}</span>
			{:else}
				{teamName}
			{/if}
		</h3>
		{#if rightIcons}
			<div class="rightIconsContainer">
				{@render rightIcons()}
			</div>
		{/if}
	</div>

	{#if children}{@render children()}{/if}

	{#if footer && showFooter}
		<div
			class={[
				"footer",
				{
					requestFooter: footerClass === "requestFooter",
					filteredFooter: footerClass === "filteredFooter",
				},
			]}
		>
			{@render footer()}
		</div>
	{/if}
</div>

<style>
	.card {
		border: var(--border-style);
		border-radius: var(--radius-box);
		overflow: hidden;
		background-color: var(--color-bg);
		display: flex;
		flex-direction: column;
	}

	.header {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-4);
		padding-bottom: var(--s-3);
	}

	.avatarContainer {
		flex-shrink: 0;
	}

	.teamName {
		flex: 1;
		font-size: var(--font-lg);
		font-weight: var(--weight-semi);
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
		line-height: 1.2;
	}

	.pickupLabel {
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		text-transform: uppercase;
		color: var(--color-text-high);
	}

	.rightIconsContainer {
		flex-shrink: 0;
		align-self: flex-start;
		display: flex;
		gap: var(--s-2);
	}

	.footer {
		background-color: var(--color-bg-high);
		padding: var(--s-2) var(--s-4);
		display: flex;
		justify-content: center;
		margin-block-start: auto;
	}

	.requestCard {
		background-color: var(--color-bg-high);
	}

	.requestFooter {
		background-image: repeating-linear-gradient(
			45deg,
			var(--color-bg),
			var(--color-bg) 10px,
			var(--color-bg-higher) 10px,
			var(--color-bg-higher) 20px
		);
	}

	.filteredFooter {
		background-color: var(--color-accent-low);
	}
</style>
