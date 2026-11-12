<script lang="ts">
import type { Snippet } from "svelte";
import type { ClassValue } from "svelte/elements";

interface Props {
	children: Snippet;
	class?: ClassValue;
	halfWidth?: boolean;
	bigger?: boolean;
	/** Spans the whole content area while staying a query container, so a descendant can break out of the page width. */
	breakoutContainer?: boolean;
	testId?: string;
}

let {
	children,
	class: className,
	halfWidth,
	bigger,
	breakoutContainer,
	testId,
}: Props = $props();
</script>

<main
	class={["main", "normal", halfWidth && "narrow", bigger && "wide", className]}
	data-main-breakout={breakoutContainer || undefined}
	data-testid={testId}
>
	{@render children()}
</main>

<style>
	@layer components {
		.main {
			container-type: inline-size;
			padding: var(--layout-main-padding);
			margin-bottom: var(--s-32);
			min-height: calc(100dvh - var(--layout-nav-height));

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
	}
</style>
