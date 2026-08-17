<script lang="ts">
import { m } from "#lib/paraglide/messages.js";

interface Props {
	text: string;
}

let { text }: Props = $props();

let isExpanded = $state(false);
let isOverflowing = $state(false);

function measure(node: HTMLDivElement) {
	if (node.scrollHeight - node.clientHeight > 1) {
		isOverflowing = true;
	}
}
</script>

<div class="textContent">
	<div class={{ clampedText: !isExpanded }} {@attach measure}>
		{text}
	</div>
	{#if isOverflowing}
		<button
			type="button"
			onclick={() => {
				isExpanded = !isExpanded;
			}}
			class="expandButton"
		>
			{isExpanded ? m.common_actions_showLess() : m.common_actions_showMore()}
		</button>
	{/if}
</div>

<style>
	.textContent {
		padding-inline: var(--s-4);
		padding-bottom: var(--s-3);
		font-size: var(--font-sm);
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
	}

	.clampedText {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.expandButton {
		background: none;
		border: none;
		color: var(--color-text-accent);
		cursor: pointer;
		font-size: var(--font-2xs);
		font-weight: var(--weight-semi);
		padding: 0;
		text-align: left;
		text-decoration: underline;

		&:hover {
			opacity: 0.8;
		}
	}
</style>
