<script lang="ts">
	import type { Component, Snippet } from 'svelte';
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
		variant?: ButtonVariant;
		size?: 'miniscule' | 'small' | 'medium' | 'big';
		icon?: Component;
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
	{...rest}
>
	{#if Icon}
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
	{@render children?.()}
</svelte:element>

<style>
	.button {
		display: flex;
		width: auto;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--color-primary);
		border-radius: var(--radius-field);
		appearance: none;
		background: var(--color-primary);
		color: var(--color-primary-content);
		cursor: pointer;
		font-size: var(--fonts-sm);
		font-weight: var(--bold);
		line-height: 1.2;
		outline-offset: 2px;
		padding-block: var(--s-1-5);
		padding-inline: var(--s-2-5);
		user-select: none;
		anchor-name: var(--anchor-name);

		&:focus-visible {
			outline: 2px solid var(--color-primary);
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
		background-color: var(--color-primary-transparent);
		color: var(--color-primary);
	}

	.outlined-success {
		border-color: var(--color-success);
		background-color: transparent;
		color: var(--color-success);
	}

	.small {
		font-size: var(--fonts-xs);
		padding-block: var(--s-1);
		padding-inline: var(--s-2);

		> .button-icon {
			width: 1rem;
			margin-inline-end: var(--s-1);
		}
	}

	.miniscule {
		font-size: var(--fonts-xxs);
		padding-block: var(--s-1);
		padding-inline: var(--s-2);

		> .button-icon {
			width: 0.857rem;
			margin-inline-end: var(--s-1);
		}
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
