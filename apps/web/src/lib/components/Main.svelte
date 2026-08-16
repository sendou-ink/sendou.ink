<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
	class?: string;
	halfWidth?: boolean;
	bigger?: boolean;
	breakoutContainer?: boolean;
	style?: string;
	testId?: string;
}

let {
	children,
	class: className,
	halfWidth,
	bigger,
	breakoutContainer,
	style,
	testId,
}: Props = $props();
</script>

<main
	class={["main", "normal", { narrow: halfWidth, wide: bigger }, className]}
	data-main-breakout={breakoutContainer || undefined}
	data-testid={testId}
	{style}
>
	{@render children()}
</main>

<style>
	.main {
		container-type: inline-size;
		padding: var(--layout-main-padding);
		margin-bottom: var(--s-32);
		min-height: calc(100dvh - var(--layout-nav-height));

		/* Fill the whole content area (sidebars already excluded by the flex
		   layout) while staying a query container, so a descendant can break out
		   of the page max-width and size against the full width via cqw units. */
		&[data-main-breakout] {
			max-width: none;
		}
	}

	.normal {
		width: 100%;
		max-width: 48rem;
		margin-inline: auto;
	}

	.narrow {
		width: 100%;
		max-width: 24rem;
		margin-inline: auto;
	}

	.wide {
		width: 100%;
		max-width: 72rem;
		margin-inline: auto;
	}
</style>
