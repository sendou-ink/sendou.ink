<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type ButtonVariant =
		| 'primary'
		| 'success'
		| 'outlined'
		| 'outlined-success'
		| 'destructive'
		| 'minimal'
		| 'minimal-success'
		| 'minimal-destructive';

	interface BaseProps {
		class?: string;
		variant?: ButtonVariant;
		size?: 'miniscule' | 'small' | 'medium' | 'big';
		icon?: Snippet;
		children?: Snippet;
	}

	type ButtonProps = HTMLButtonAttributes &
		BaseProps & {
			href?: never;
			target?: never;
		};

	type LinkProps = HTMLAnchorAttributes &
		BaseProps & {
			type?: never;
			disabled?: never;
		};

	type Props = ButtonProps | LinkProps;

	let {
		class: className,
		variant = 'primary',
		size = 'medium',
		icon,
		children,
		...rest
	}: Props = $props();
</script>

<svelte:element
	this={rest.href ? 'a' : 'button'}
	class={[
		className,
		'button',
		{
			miniscule: size === 'miniscule',
			small: size === 'small',
			big: size === 'big',
			primary: variant === 'primary',
			success: variant === 'success',
			outlined: variant === 'outlined',
			outlinedSuccess: variant === 'outlined-success',
			destructive: variant === 'destructive',
			minimal: variant === 'minimal',
			minimalSuccess: variant === 'minimal-success',
			minimalDestructive: variant === 'minimal-destructive'
		}
	]}
	{...rest}
>
	{#if icon}
		<span class="buttonIcon">
			{@render icon()}
		</span>
	{/if}
	{@render children?.()}
</svelte:element>

<style>
	.button {
		display: flex;
		width: auto;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--theme);
		border-radius: var(--rounded-sm);
		appearance: none;
		background: var(--theme);
		color: var(--button-text);
		cursor: pointer;
		font-size: var(--fonts-sm);
		font-weight: var(--bold);
		line-height: 1.2;
		outline-offset: 2px;
		padding-block: var(--s-1-5);
		padding-inline: var(--s-2-5);
		user-select: none;
	}

	.button:focus-visible {
		outline: 2px solid var(--theme);
	}

	.button:active {
		transform: translateY(1px);
	}

	.button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
		transform: initial;
	}

	.outlined {
		background-color: var(--theme-very-transparent);
		color: var(--theme);
	}

	.outlinedSuccess {
		border-color: var(--theme-success);
		background-color: transparent;
		color: var(--theme-success);
	}

	.small {
		font-size: var(--fonts-xs);
		padding-block: var(--s-1);
		padding-inline: var(--s-2);
	}

	.miniscule {
		font-size: var(--fonts-xxs);
		padding-block: var(--s-1);
		padding-inline: var(--s-2);
	}

	.big {
		font-size: var(--fonts-md);
		padding-block: var(--s-2-5);
		padding-inline: var(--s-6);
	}

	.minimal {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--theme);
		outline: initial;
	}

	.minimal:focus-visible {
		outline: 2px solid var(--theme);
	}

	.minimalSuccess {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--theme-success);
	}

	.success {
		border-color: var(--theme-success);
		background-color: var(--theme-success);
		outline-color: var(--theme-success);
	}

	.destructive {
		border-color: var(--theme-error);
		background-color: transparent;
		color: var(--theme-error);
		outline-color: var(--theme-error);
	}

	.minimalDestructive {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--theme-error);
		outline-color: var(--theme-error);
	}

	.buttonIcon {
		width: 1.25rem;
		margin-inline-end: var(--s-1-5);
	}

	.buttonIcon.lonely {
		margin-inline-end: 0 !important;
	}

	.small > .buttonIcon {
		width: 1rem;
		margin-inline-end: var(--s-1);
	}

	.miniscule > .buttonIcon {
		width: 0.857rem;
		margin-inline-end: var(--s-1);
	}
</style>
