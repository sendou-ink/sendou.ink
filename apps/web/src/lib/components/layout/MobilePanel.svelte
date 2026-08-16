<script lang="ts">
import { X } from "@lucide/svelte";
import type { Snippet } from "svelte";
import GhostTabBar from "./GhostTabBar.svelte";

interface Props {
	title: string;
	icon: Snippet;
	onClose: () => void;
	children: Snippet;
	ghostTabCount: number;
	onGhostTabPress: (index: number) => void;
	skipAnimation: boolean;
}

let {
	title,
	icon,
	onClose,
	children,
	ghostTabCount,
	onGhostTabPress,
	skipAnimation,
}: Props = $props();
</script>

<div class={["panelOverlay", { noAnimation: skipAnimation }]}>
	<div class={["panel", { noAnimation: skipAnimation }]}>
		<div data-testid="mobile-nav-panel" class="panelDialog" role="dialog">
			<header class="panelHeader">
				<div class="panelIconContainer">{@render icon()}</div>
				<h2 class="panelTitle">{title}</h2>
				<button
					type="button"
					data-testid="panel-close-button"
					class="panelCloseButton"
					onclick={onClose}
				>
					<X size={18} />
				</button>
			</header>
			<div class="panelContent scrollbar">
				{@render children()}
			</div>
			<GhostTabBar tabCount={ghostTabCount} onTabPress={onGhostTabPress} />
		</div>
	</div>
</div>

<style>
	.panelOverlay {
		position: fixed;
		inset: 0;
		bottom: var(--layout-nav-height);
		z-index: 18;
		background-color: rgba(0, 0, 0, 0.25);
		backdrop-filter: blur(10px);
		animation: fade-in 200ms ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 85%;
		background-color: var(--color-bg);
		border-radius: var(--radius-box) var(--radius-box) 0 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		padding-block-end: env(safe-area-inset-bottom);
		animation: slide-up 200ms ease-out;
	}

	@keyframes slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	.panelHeader {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding-inline: var(--s-4);
		background-color: var(--color-bg-high);
		border-bottom: 1.5px solid var(--color-border);
		z-index: 1;
		flex-shrink: 0;
		color: var(--color-text-high);
		min-height: var(--layout-nav-height);
	}

	.panelTitle {
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
	}

	.panelContent {
		flex: 1;
		overflow-y: auto;
		padding: var(--s-2);
		display: flex;
		flex-direction: column;
	}

	.panelDialog {
		outline: none;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.panelCloseButton {
		display: grid;
		place-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-error);
		padding: 0;
		height: var(--field-size);
		aspect-ratio: 1 / 1;
		border-radius: var(--radius-field);
		margin-inline-start: auto;

		&:hover {
			background-color: var(--color-bg-higher);
		}
	}

	.panelIconContainer {
		border-radius: var(--radius-field);
	}

	.noAnimation {
		animation: none;
	}
</style>
