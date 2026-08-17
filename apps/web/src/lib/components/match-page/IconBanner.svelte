<script lang="ts">
import type { Snippet } from "svelte";
import {
	type BannerHost,
	joinInfo,
	screenNotice,
} from "./MatchBanner.svelte";

interface Props {
	icon: Snippet;
	header: string;
	subtitle?: string;
	screenLegal?: boolean;
	joinPool?: string | null;
	joinPass?: string | null;
	host?: BannerHost | null;
	topRight?: Snippet;
	testId?: string;
}

let {
	icon,
	header,
	subtitle,
	screenLegal,
	joinPool,
	joinPass,
	host,
	topRight,
	testId,
}: Props = $props();
</script>

<div class="iconBanner" data-testid={testId}>
	{@render icon()}
	<div class="iconBannerHeader">{header}</div>
	{#if subtitle}
		<div class="iconBannerSubtitle">{subtitle}</div>
	{/if}
	{#if joinPool}
		{@render joinInfo({ pool: joinPool, pass: joinPass, host })}
	{/if}
	{#if screenLegal !== undefined}
		{@render screenNotice(screenLegal)}
	{/if}
	{#if topRight}
		<div class="iconBannerBottomRight">{@render topRight()}</div>
	{/if}
</div>

<style>
	.iconBanner {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--s-0-5);
		line-height: 1.2;
		width: 100%;
		height: var(--banner-height);
		border-radius: var(--radius-box);
		background-color: var(--color-bg-higher);
	}

	.iconBannerHeader {
		font-size: var(--font-md);
		font-weight: var(--weight-bold);
	}

	.iconBannerSubtitle {
		font-size: var(--font-xs);
		color: var(--color-text-high);
	}

	.iconBannerBottomRight {
		position: absolute;
		top: var(--s-2);
		right: var(--s-2);
	}
</style>
