<script lang="ts">
import { Check, Minus, X } from "@lucide/svelte";
import type { Snippet } from "svelte";
import type { Tables } from "#lib/server/db/tables.ts";

type Sentiment = Tables["PrivateUserNote"]["sentiment"];

const BADGE_CLASS: Record<Sentiment, string> = {
	POSITIVE: "positive",
	NEUTRAL: "neutral",
	NEGATIVE: "negative",
};

const SIZE_CLASS = {
	xs: "badgeXs",
	sm: "badgeSm",
	md: "badgeMd",
} as const;

interface Props {
	sentiment?: Sentiment | null;
	size?: keyof typeof SIZE_CLASS;
	class?: string;
	onclick?: () => void;
	children: Snippet;
}

let {
	sentiment,
	size = "md",
	class: className,
	onclick,
	children,
}: Props = $props();
</script>

<!--
@component
Wraps an avatar (or any node) and overlays a sentiment badge on the bottom-left corner when
`sentiment` is set: POSITIVE → green check, NEGATIVE → red cross, NEUTRAL → grey dash. Renders the
children without a badge when `sentiment` is `null`/`undefined`. `size` scales the badge to match
the wrapped avatar (`xs` for tiny avatars, `sm` for small avatars, `md` for large ones).

`onclick` makes the whole wrapper (avatar and badge) clickable. It is kept out of the tab order, so
only use it as a shortcut to an action that is also available elsewhere.
-->

<!-- the element is a real <button> whenever it is clickable -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element
	this={onclick ? "button" : "div"}
	type={onclick ? "button" : undefined}
	class={["wrapper", className, { clickable: Boolean(onclick) }]}
	{onclick}
	tabindex={onclick ? -1 : undefined}
>
	{@render children()}
	{#if sentiment}
		<span
			class={["badge", SIZE_CLASS[size], BADGE_CLASS[sentiment]]}
			aria-hidden="true"
		>
			{#if sentiment === "POSITIVE"}
				<Check />
			{:else if sentiment === "NEGATIVE"}
				<X />
			{:else}
				<Minus />
			{/if}
		</span>
	{/if}
</svelte:element>

<style>
	.wrapper {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		width: fit-content;
	}

	.clickable {
		cursor: pointer;
		border: none;
		padding: 0;
		background: none;
	}

	.badge {
		position: absolute;
		bottom: 15%;
		inset-inline-start: 15%;
		transform: translate(-50%, 50%);
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		border: 2px solid var(--color-bg);
		color: var(--color-bg);

		& > :global(svg) {
			stroke-width: 3;
		}
	}

	.badgeMd {
		width: 1.25rem;
		height: 1.25rem;

		& > :global(svg) {
			width: 0.75rem;
			height: 0.75rem;
		}
	}

	.badgeSm {
		width: 0.9rem;
		height: 0.9rem;
		border-width: 1.5px;

		& > :global(svg) {
			width: 0.6rem;
			height: 0.6rem;
		}
	}

	.badgeXs {
		width: 0.65rem;
		height: 0.65rem;
		border-width: 1.5px;

		& > :global(svg) {
			width: 0.45rem;
			height: 0.45rem;
		}
	}

	.positive {
		background-color: var(--color-success);
	}

	.negative {
		background-color: var(--color-error);
	}

	.neutral {
		background-color: var(--color-text-high);
	}
</style>
