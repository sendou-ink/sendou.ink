<script lang="ts" module>
const NUMBER_TO_TIER: Record<number, string> = {
	1: "X",
	2: "S+",
	3: "S",
	4: "A+",
	5: "A",
	6: "B+",
	7: "B",
	8: "C+",
	9: "C",
};

const TIER_STYLE_CLASS: Record<number, string> = {
	1: "tierX",
	2: "tierSPlus",
	3: "tierS",
	4: "tierAPlus",
	5: "tierA",
	6: "tierBPlus",
	7: "tierB",
	8: "tierCPlus",
	9: "tierC",
};

const POLISHED_TIERS = [1, 2, 3];
</script>

<script lang="ts">
	import { dynamicMessage } from "#lib/modules/i18n/messages.ts";

	interface Props {
		tier: number;
		isTentative?: boolean;
		withoutAnimation?: boolean;
	}

	let { tier, isTentative = false, withoutAnimation = false }: Props = $props();

	const tierName = $derived(NUMBER_TO_TIER[tier] ?? "");
	const tierClass = $derived(TIER_STYLE_CLASS[tier] ?? "");
	const displayName = $derived(isTentative ? `~${tierName}` : tierName);
</script>

<div
	class={[
		"pill",
		tierClass,
		{ polished: POLISHED_TIERS.includes(tier), withoutAnimation },
	]}
	data-testid={isTentative ? "tentative-tier" : "confirmed-tier"}
	title={dynamicMessage(
		isTentative ? "common_tier_tentative" : "common_tier_confirmed",
	).replace("{tierName}", tierName)}
>
	{displayName}
</div>

<style>
	:global(:root) {
		--tier-bg-1: hsl(45, 100%, 47%);
		--tier-bg-2: hsl(280, 90%, 44%);
		--tier-bg-3: hsl(280, 65%, 52%);
		--tier-bg-4: hsl(212, 95%, 44%);
		--tier-bg-5: hsl(212, 80%, 51%);
		--tier-bg-6: hsl(145, 80%, 34%);
		--tier-bg-7: hsl(145, 60%, 41%);
		--tier-bg-8: hsl(220, 10%, 40%);
		--tier-bg-9: hsl(220, 8%, 49%);
		--tier-text-1: hsl(45, 100%, 12%);
		--tier-text-2: hsl(280, 100%, 94%);
		--tier-text-3: hsl(280, 100%, 95%);
		--tier-text-4: hsl(212, 100%, 93%);
		--tier-text-5: hsl(212, 100%, 95%);
		--tier-text-6: hsl(145, 85%, 92%);
		--tier-text-7: hsl(145, 75%, 94%);
		--tier-text-8: hsl(220, 15%, 92%);
		--tier-text-9: hsl(220, 15%, 95%);
	}

	.pill {
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		border-radius: var(--radius-selector);
		padding: 0 var(--s-1-5);
		height: var(--selector-size-sm);
		display: grid;
		place-items: center;
		min-width: 33px;
		text-align: center;
	}

	.tierX {
		--_polished-bg: var(--tier-bg-1);
		background-color: var(--tier-bg-1);
		color: var(--tier-text-1);
	}

	.tierSPlus {
		--_polished-bg: var(--tier-bg-2);
		background-color: var(--tier-bg-2);
		color: var(--tier-text-2);
	}

	.tierS {
		--_polished-bg: var(--tier-bg-3);
		background-color: var(--tier-bg-3);
		color: var(--tier-text-3);
	}

	.tierAPlus {
		background-color: var(--tier-bg-4);
		color: var(--tier-text-4);
	}

	.tierA {
		background-color: var(--tier-bg-5);
		color: var(--tier-text-5);
	}

	.tierBPlus {
		background-color: var(--tier-bg-6);
		color: var(--tier-text-6);
	}

	.tierB {
		background-color: var(--tier-bg-7);
		color: var(--tier-text-7);
	}

	.tierCPlus {
		background-color: var(--tier-bg-8);
		color: var(--tier-text-8);
	}

	.tierC {
		background-color: var(--tier-bg-9);
		color: var(--tier-text-9);
	}

	.polished {
		position: relative;
		overflow: hidden;
		background-image: linear-gradient(
			160deg,
			hsl(from var(--_polished-bg) calc(h + 2) s calc(l + 14)),
			var(--_polished-bg) 50%,
			hsl(from var(--_polished-bg) calc(h - 3) s calc(l - 9))
		);

		&::after {
			content: "";
			position: absolute;
			inset: 0;
			background: linear-gradient(
				115deg,
				transparent 35%,
				hsl(0, 0%, 100%, 0.5) 50%,
				transparent 65%
			);
			transform: translateX(-100%);
			animation: shine-sweep 6s ease-in-out infinite;
		}
	}

	@keyframes shine-sweep {
		0% {
			transform: translateX(-100%);
		}

		12% {
			transform: translateX(100%);
		}

		100% {
			transform: translateX(100%);
		}
	}

	.withoutAnimation::after {
		animation: none;
		visibility: hidden;
	}

	@media (prefers-reduced-motion: reduce) {
		.polished::after {
			animation: none;
			visibility: hidden;
		}
	}
</style>
