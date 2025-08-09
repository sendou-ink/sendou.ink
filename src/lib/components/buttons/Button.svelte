<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from '../Spinner.svelte';

	export type ButtonVariant =
		| 'primary'
		| 'success'
		| 'outlined'
		| 'outlined-success'
		| 'destructive'
		| 'minimal'
		| 'minimal-success'
		| 'minimal-destructive';

	interface BaseProps {
		variant?: ButtonVariant;
		size?: 'miniscule' | 'small' | 'medium' | 'big';
		icon?: Component;
		loading?: boolean;
		disabled?: boolean;
		children?: Snippet;
	}

	export type ButtonProps = HTMLButtonAttributes &
		BaseProps & {
			href?: never;
			target?: never;
		};

	type LinkProps = HTMLAnchorAttributes &
		BaseProps & {
			type?: never;
			disabled?: never;
			popovertarget?: never;
		};

	type Props = ButtonProps | LinkProps;

	let {
		class: className,
		variant = 'primary',
		size = 'medium',
		icon: Icon,
		loading = false,
		disabled = false,
		children,
		...rest
	}: Props = $props();
</script>

<svelte:element
	this={rest.href ? 'a' : 'button'}
	popovertarget={rest.popovertarget}
	style={rest.popovertarget ? `--anchor-name:${rest.popovertarget}` : undefined}
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
			'outlined-success': variant === 'outlined-success',
			destructive: variant === 'destructive',
			minimal: variant === 'minimal',
			'minimal-success': variant === 'minimal-success',
			'minimal-destructive': variant === 'minimal-destructive'
		}
	]}
	aria-busy={loading}
	aria-disabled={disabled}
	{disabled}
	{...rest}
>
	{#if Icon && !loading}
		<span
			class={[
				'button-icon',
				{
					lonely: !children
				}
			]}
		>
			<Icon />
		</span>
	{/if}
	{#if loading}
		<Spinner size="20" />
	{/if}
	<div>
		{@render children?.()}
	</div>
</svelte:element>

<style>
	.button {
		display: flex;
		justify-content: center;
		align-items: center;
		vertical-align: middle;
		min-height: 2.15rem;
		height: auto;
		border: 2px solid var(--color-primary);
		border-radius: var(--radius-field);
		position: relative;
		cursor: pointer;
		appearance: none;
		background: var(--color-primary);
		color: var(--color-primary-content);
		font-size: var(--fonts-sm);
		font-weight: var(--bold);
		line-height: 1.2;
		outline-offset: 2px;
		padding-inline: var(--s-2-5);
		user-select: none;
		anchor-name: var(--anchor-name);

		&:focus-visible {
			outline: 2px solid var(--color-primary);
		}

		&:active {
			transform: translateY(1px);
		}

		&:disabled,
		&[aria-busy='true'] {
			cursor: not-allowed;
			opacity: 0.5;
			transform: initial;
		}

		&[aria-busy='true'] > div {
			visibility: hidden;
		}

		:global(.spinner) {
			position: absolute;
			top: calc(50% - 10px);
			left: calc(50% - 10px);
		}
	}

	.outlined {
		background-color: var(--color-primary-transparent);
		color: var(--color-primary);
	}

	.outlined-success {
		border-color: var(--color-success);
		background-color: transparent;
		color: var(--color-success);
	}

	.small {
		min-height: 1.75rem;
		font-size: var(--fonts-xs);
		padding-inline: var(--s-2);

		> .button-icon {
			width: 1rem;
			margin-inline-end: var(--s-1);
		}
	}

	.miniscule {
		min-height: 1.5rem;
		font-size: var(--fonts-xxs);
		padding-inline: var(--s-2);

		> .button-icon {
			width: 0.857rem;
			margin-inline-end: var(--s-1);
		}
	}

	.big {
		min-height: 2.75rem;
		font-size: var(--fonts-md);
		padding-inline: var(--s-6);
	}

	.minimal {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--color-primary);
		outline: initial;

		&:focus-visible {
			outline: 2px solid var(--color-primary);
		}
	}

	.minimal-success {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--color-success);
	}

	.success {
		border-color: var(--color-success);
		background-color: var(--color-success);
		outline-color: var(--color-success);
	}

	.destructive {
		border-color: var(--color-error);
		background-color: transparent;
		color: var(--color-error);
		outline-color: var(--color-error);
	}

	.minimal-destructive {
		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--color-error);
		outline-color: var(--color-error);
	}

	.button-icon {
		width: 1.25rem;
		margin-inline-end: var(--s-1-5);

		/** xxx: this is not correct, on safari different size (check Support button for example)*/
		:global(svg) {
			height: max-content;
		}

		&.lonely {
			margin-inline-end: 0 !important;
		}
	}
</style>
