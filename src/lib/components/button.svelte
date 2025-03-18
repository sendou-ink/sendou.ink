<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Size } from "./types";

	interface ButtonProps {
		children: Snippet;
		variant?: "primary" | "outline";
		onClick?: () => void;
		type?: "button" | "submit";
		size?: Size;
	}

	let { children, variant = "primary", onClick, type = "button", size }: ButtonProps = $props();
</script>

<button
	class={[
		"btn",
		"btn-primary",
		{
			"btn-outline": variant === "outline",
			"btn-xs": size === "xs",
			"btn-sm": size === "sm",
			"btn-lg": size === "lg",
			"btn-xl": size === "xl",
		},
	]}
	onclick={onClick}
	{type}
>
	{@render children()}
</button>
