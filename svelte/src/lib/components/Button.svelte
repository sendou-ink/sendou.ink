<script lang="ts" module>
export type ButtonVariant =
	| "primary"
	| "success"
	| "destructive"
	| "outlined"
	| "outlined-success"
	| "outlined-destructive"
	| "minimal"
	| "minimal-success"
	| "minimal-destructive"
	| "ghost";

export type ButtonSize = "miniscule" | "small" | "medium" | "big";

export interface ButtonLookProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	shape?: "circle" | "square";
	class?: ClassValue;
	testId?: string;
	/** Receives the class the icon element has to carry to be sized and spaced by the button. */
	icon?: Snippet<[string]>;
	children?: Snippet;
}
</script>

<script lang="ts">
import type { Snippet } from "svelte";
import type {
	ClassValue,
	HTMLAnchorAttributes,
	HTMLButtonAttributes,
} from "svelte/elements";
import Spinner from "./Spinner.svelte";

type Props = ButtonLookProps &
	(
		| ({
				/** Renders a link with the button look. */
				href: string;
				isExternal?: boolean;
				isDisabled?: never;
				isPending?: never;
				isLook?: never;
		  } & Omit<HTMLAnchorAttributes, "class" | "href">)
		| ({
				href?: never;
				isExternal?: never;
				isDisabled?: boolean;
				isPending?: boolean;
				/** Renders a plain element with the button look, for a parent that handles the interaction itself (e.g. a tab). */
				isLook?: boolean;
		  } & Omit<HTMLButtonAttributes, "class" | "disabled">)
	);

let {
	variant,
	size,
	shape,
	class: className,
	testId,
	icon,
	children,
	href,
	isExternal,
	isDisabled,
	isPending,
	isLook,
	...rest
}: Props = $props();

const buttonClass = $derived([
	className,
	"button",
	variant && variant !== "primary" ? variant : null,
	size && size !== "medium" ? size : null,
	shape,
]);

const iconClass = $derived(
	[
		"button-icon",
		children ? null : "lonely",
		size && size !== "medium" ? `button-icon-${size}` : null,
	]
		.filter(Boolean)
		.join(" "),
);
</script>

{#if isLook}
	<div class={buttonClass}>
		{@render icon?.(iconClass)}
		{@render children?.()}
	</div>
{:else if href !== undefined}
	<a
		{...rest as HTMLAnchorAttributes}
		class={buttonClass}
		{href}
		target={isExternal ? "_blank" : undefined}
		rel={isExternal ? "noreferrer" : undefined}
		data-testid={testId}
	>
		{@render icon?.(iconClass)}
		{@render children?.()}
	</a>
{:else}
	{@const { onclick, type = "button", ...buttonRest } =
		rest as HTMLButtonAttributes}
	<button
		data-testid={testId}
		{type}
		{...buttonRest}
		disabled={isDisabled}
		aria-disabled={isPending || undefined}
		aria-busy={isPending || undefined}
		data-pending={isPending || undefined}
		onclick={(event) => {
			if (isPending) {
				event.preventDefault();
				return;
			}
			onclick?.(event);
		}}
		class={buttonClass}
	>
		{@render icon?.(iconClass)}
		{#if isPending}
			<span class="pending-content">{@render children?.()}</span>
			<Spinner class="button-spinner" />
		{:else}
			{@render children?.()}
		{/if}
	</button>
{/if}

<style>
	@layer elements {
		.button {
			display: flex;
			width: auto;
			align-items: center;
			justify-content: center;
			border: var(--border-width) solid var(--color-fill-accent);
			border-radius: var(--radius-field);
			appearance: none;
			background: var(--color-fill-accent);
			color: var(--color-fg-on-accent);
			cursor: pointer;
			font-size: var(--font-sm);
			font-weight: var(--weight-bold);
			padding: 0 var(--field-padding);
			user-select: none;
			outline-color: var(--color-fg-accent);
			height: var(--field-size);
			white-space: nowrap;
			transition:
				background-color 0.15s,
				color 0.15s;
			--button-hover-bg: color-mix(
				in oklch,
				var(--color-fill-accent),
				var(--color-text) 15%
			);

			&:hover:not(:disabled, [data-pending]) {
				background-color: var(--button-hover-bg);
			}

			&:focus-visible {
				outline-style: solid;
				outline-width: 2px;
				outline-offset: 1px;
			}

			&:active {
				transform: translateY(1px);
			}

			&:disabled,
			&[data-pending] {
				cursor: not-allowed;
				opacity: 0.5;
				transform: initial;
			}

			&[data-pending] {
				position: relative;
				cursor: progress;
				opacity: 0.7;

				& > :global(.button-icon) {
					opacity: 0;
				}
			}

			& :global(.button-icon) {
				min-width: 20px;
				max-width: 20px;
				margin-inline-end: var(--s-1-5);
			}

			& :global(.button-icon-small) {
				min-width: 18px;
				max-width: 18px;
				margin-inline-end: var(--s-1);
			}

			& :global(.button-icon-miniscule) {
				min-width: 14px;
				max-width: 14px;
				margin-inline-end: var(--s-1);
			}

			& :global(.button-icon-big) {
				min-width: 28px;
				max-width: 28px;
				margin-inline-end: var(--s-2);
			}

			& :global(.button-icon.lonely) {
				margin-inline-end: 0;
			}

			& :global(.button-spinner) {
				position: absolute;
				inset: 0;
				width: 1.4em;
				height: 1.4em;
				margin: auto;
			}
		}

		/* text stays in the accessibility tree (unlike visibility: hidden) and keeps the button's width */
		.pending-content {
			display: contents;
			color: transparent;
		}

		.outlined {
			border-color: var(--color-fg-accent);
			background-color: transparent;
			color: var(--color-fg-accent);
			--button-hover-bg: var(--color-bg-accent);
		}

		.outlined-success {
			border-color: var(--color-success);
			background-color: transparent;
			color: var(--color-success);
			outline-color: var(--color-success);
			--button-hover-bg: var(--color-success-low);
		}

		.outlined-destructive {
			border-color: var(--color-error);
			background-color: transparent;
			color: var(--color-error);
			outline-color: var(--color-error);
			--button-hover-bg: var(--color-error-low);
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
			color: var(--color-fg-accent);
			outline: initial;
			--button-hover-bg: transparent;

			&:hover:not(:disabled, [data-pending]) {
				color: color-mix(
					in oklch,
					var(--color-fg-accent),
					var(--color-text) 40%
				);
			}

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
			--button-hover-bg: transparent;

			&:hover:not(:disabled, [data-pending]) {
				color: color-mix(in oklch, var(--color-success), var(--color-text) 40%);
			}
		}

		.success {
			border-color: var(--color-success);
			background-color: var(--color-success);
			color: var(--color-text-inverse);
			outline-color: var(--color-success);
			--button-hover-bg: color-mix(
				in oklch,
				var(--color-success),
				var(--color-text) 15%
			);
		}

		.destructive {
			border-color: var(--color-error);
			background-color: var(--color-error);
			color: var(--color-text-inverse);
			outline-color: var(--color-error);
			--button-hover-bg: color-mix(
				in oklch,
				var(--color-error),
				var(--color-text) 15%
			);
		}

		.minimal-destructive {
			padding: 0;
			border: none;
			background-color: transparent;
			color: var(--color-error);
			outline-color: var(--color-error);
			--button-hover-bg: transparent;

			&:hover:not(:disabled, [data-pending]) {
				color: color-mix(in oklch, var(--color-error), var(--color-text) 40%);
			}
		}

		/* borderless and in the text color, gets a background on hover */
		.ghost {
			border-color: transparent;
			background-color: transparent;
			color: var(--color-text);
			--button-hover-bg: var(--color-bg-high);
		}
	}
</style>
