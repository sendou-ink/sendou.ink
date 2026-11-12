<!-- The editable variant of the React BadgeDisplay (the one form fields use): every badge shown, no pagination. -->
<script lang="ts">
import { Trash } from "@lucide/svelte";
import Button from "#lib/components/Button.svelte";
import { badgeExplanationText } from "../badge-explanation.ts";
import Badge from "./Badge.svelte";

interface DisplayedBadge {
	id: number;
	displayName: string;
	code: string;
	hue: number | null;
	count?: number;
}

interface Props {
	badges: DisplayedBadge[];
	onChange: (badgeIds: number[]) => void;
}

let { badges, onChange }: Props = $props();

const bigBadge = $derived(badges[0]);
const smallBadges = $derived(badges.slice(1));

function setBadgeFirst(badge: DisplayedBadge) {
	onChange(
		badges
			.map((existing, i) => {
				if (i === 0) return badge;
				if (existing.id === badge.id) return badges[0];
				return existing;
			})
			.map((existing) => existing.id),
	);
}
</script>

{#if bigBadge}
	<div data-testid="badge-display">
		<div class={["badges", smallBadges.length === 0 && "justify-center"]}>
			<Badge badge={bigBadge} size={125} />
			{#if smallBadges.length > 0}
				<div class="small-badges">
					{#each smallBadges as badge (badge.id)}
						<div class="small-badge-container">
							<Badge {badge} onclick={() => setBadgeFirst(badge)} size={48} />
							{#if badge.count && badge.count > 1}
								<div class="small-badge-count">×{badge.count}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<div class="badge-explanation">
			{badgeExplanationText(bigBadge)}
			<Button
				variant="minimal-destructive"
				onclick={() =>
					onChange(
						badges.filter((b) => b.id !== bigBadge.id).map((b) => b.id),
					)}
			>
				{#snippet icon(iconClass)}<Trash class={iconClass} />{/snippet}
			</Button>
		</div>
	</div>
{/if}

<style>
	@layer features {
		.badges {
			display: flex;
			min-width: 20rem;
			max-width: 20rem;
			min-height: 12rem;
			align-items: center;
			padding: var(--s-2);
			border-radius: var(--radius-box);
			background-color: var(--color-bg-badge);
			margin-inline: auto;
		}

		.small-badges {
			display: grid;
			place-items: center;
			grid-template-columns: repeat(3, 1fr);
			margin: 0 auto;
			cursor: pointer;
			gap: var(--s-3);
		}

		.badge-explanation {
			color: var(--color-text-high);
			font-size: var(--font-xs);
			display: flex;
			align-items: center;
			justify-content: center;
			gap: var(--s-2);
			margin-block-end: var(--s-1);
		}

		.small-badge-container {
			position: relative;
		}

		.small-badge-count {
			position: absolute;
			top: 0;
			right: 0;
			margin-top: -8px;
			margin-right: auto;
			margin-left: auto;
			color: var(--color-fg-accent);
			font-size: var(--font-2xs);
			font-weight: var(--weight-bold);
		}
	}
</style>
