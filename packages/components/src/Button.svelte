<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	type ButtonVariant =
		| "primary"
		| "success"
		| "destructive"
		| "outlined"
		| "outlined-success"
		| "outlined-destructive"
		| "minimal"
		| "minimal-success"
		| "minimal-destructive";

	interface Props extends HTMLButtonAttributes {
		variant?: ButtonVariant;
		size?: "miniscule" | "small" | "medium" | "big";
		shape?: "circle" | "square";
		icon?: Snippet;
		children?: Snippet;
		testId?: string;
	}

	let {
		variant,
		size,
		shape,
		icon,
		children,
		testId,
		class: className,
		type = "button",
		...rest
	}: Props = $props();
</script>

<button
	{...rest}
	{type}
	data-testid={testId}
	class={[
		className,
		"button",
		variant,
		size,
		shape,
	]}
>
	{#if icon}
		<span class={["buttonIcon", size, { lonely: !children }]}>
			{@render icon()}
		</span>
	{/if}
	{#if children}{@render children()}{/if}
</button>

<style>
	.button {
		display: flex;
		width: auto;
		align-items: center;
		justify-content: center;
		border: var(--border-style-accent);
		border-radius: var(--radius-field);
		appearance: none;
		background: var(--color-text-accent);
		color: var(--color-text-inverse);
		cursor: pointer;
		font-size: var(--font-sm);
		font-weight: var(--weight-bold);
		padding: 0 var(--field-padding);
		user-select: none;
		outline-color: var(--color-text-accent);
		height: var(--field-size);
		white-space: nowrap;

		&:focus-visible {
			outline-style: solid;
			outline-width: 2px;
			outline-offset: 1px;
		}

		&:active {
			transform: translateY(1px);
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.5;
			transform: initial;
		}
	}

	.outlined {
		background-color: transparent;
		color: var(--color-text-accent);
	}

	.outlined-success {
		border-color: var(--color-success);
		background-color: transparent;
		color: var(--color-success);
		outline-color: var(--color-success);
	}

	.outlined-destructive {
		border-color: var(--color-error);
		background-color: transparent;
		color: var(--color-error);
		outline-color: var(--color-error);
	}

	.small {
		font-size: var(--font-xs);
		height: var(--field-size-sm);
	}

	.miniscule {
		font-size: var(--font-2xs);
		height: var(--field-size-xs);
	}

	.big {
		font-size: var(--font-md);
		height: var(--field-size-lg);
	}

	.square {
		aspect-ratio: 1 / 1;
		padding: 0;
	}

	.circle {
		border-radius: 50%;
		aspect-ratio: 1 / 1;
		padding: 0;
	}

	.minimal {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--color-text-accent);
		outline: initial;

		&:focus-visible {
			outline: var(--focus-ring);
		}
	}

	.minimal-success {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--color-success);
		outline-color: var(--color-success);
	}

	.success {
		border-color: var(--color-success);
		background-color: var(--color-success);
		outline-color: var(--color-success);
	}

	.destructive {
		border-color: var(--color-error);
		background-color: var(--color-error);
		color: var(--color-text-inverse);
		outline-color: var(--color-error);
	}

	.minimal-destructive {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--color-error);
		outline-color: var(--color-error);
	}

	span.buttonIcon {
		display: inline-flex;
		min-width: 20px;
		max-width: 20px;
		margin-inline-end: var(--s-1-5);

		&.lonely {
			margin-inline-end: 0 !important;
		}

		&.small {
			min-width: 18px;
			max-width: 18px;
			margin-inline-end: var(--s-1);
		}

		&.miniscule {
			min-width: 14px;
			max-width: 14px;
			margin-inline-end: var(--s-1);
		}

		&.big {
			min-width: 28px;
			max-width: 28px;
			margin-inline-end: var(--s-2);
		}

		& :global(svg) {
			width: 100%;
			height: auto;
		}
	}
</style>
