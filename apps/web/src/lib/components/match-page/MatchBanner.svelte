<script module lang="ts">
import { Check, X } from "@lucide/svelte";
import { Button, Popover } from "@sendou/components";
import Avatar from "#lib/components/Avatar.svelte";
import { m } from "#lib/paraglide/messages.js";
import { specialWeaponImageUrl } from "#lib/utils/urls.ts";

export { joinInfo, screenNotice };

export interface BannerHost {
	name: string;
	avatarUrl?: string;
}
</script>

<script lang="ts">
import type { ModeShort, StageId } from "@sendou/in-game-lists/types";
import type { Snippet } from "svelte";

// xxx: MultiMatchBanner, MatchBannerBottomRow, MatchBannerStartedAt and
// MatchBannerTimer are not ported yet — only the sendouq/tournament match
// pages reach them, the scrims usage does not
import ModeImage from "#lib/components/ModeImage.svelte";
import { modeShortName, stageName } from "#lib/modules/i18n/messages.ts";
import { stageBannerImageUrl } from "#lib/utils/urls.ts";

interface Props {
	stageId: StageId;
	mode: ModeShort;
	screenLegal?: boolean;
	joinPool?: string | null;
	joinPass?: string | null;
	host?: BannerHost | null;
	children?: Snippet;
}

let {
	stageId,
	mode,
	screenLegal,
	joinPool,
	joinPass,
	host,
	children,
}: Props = $props();
</script>

<div
	class="banner"
	style:--stage-img="url({stageBannerImageUrl(stageId)})"
	data-testid="stage-banner"
>
	<div class="map thickText" data-testid="banner-map-{mode}-{stageId}">
		<ModeImage {mode} size={24} />
		{modeShortName(mode)} {stageName(stageId)}
	</div>
	<div class="info thickText">{@render children?.()}</div>

	{#if joinPool}
		{@render joinInfo({ pool: joinPool, pass: joinPass, host })}
	{/if}
	{#if screenLegal !== undefined}
		{@render screenNotice(screenLegal)}
	{/if}
</div>

{#snippet joinInfo({
	pool,
	pass,
	host,
}: {
	pool: string;
	pass?: string | null;
	host?: BannerHost | null;
})}
	<div class="joinInfo">
		<div class="joinInfoItem">
			<div class="joinInfoLabel">{m.q_match_pool()}</div>
			<div class="joinInfoValue">{pool}</div>
		</div>
		{#if pass}
			<div class="joinInfoItem">
				<div class="joinInfoLabel">{m.q_match_password_short()}</div>
				<div class="joinInfoValue" data-testid="room-pass">{pass}</div>
			</div>
		{/if}
		{#if host}
			<div class="joinInfoItem">
				<div class="joinInfoLabel">{m.common_host()}</div>
				<div class="joinInfoValue">
					<Avatar
						url={host.avatarUrl}
						identiconInput={host.name}
						size="xxs"
						alt={host.name}
					/>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet screenNotice(screenLegal: boolean)}
	<span class="screenNoticeRoot">
		<Popover>
			{#snippet trigger(triggerProps)}
				<Button
					variant="minimal"
					class="notice"
					testId={screenLegal ? "screen-allowed" : "screen-banned"}
					aria-label={screenLegal ? "Screen allowed" : "Screen banned"}
					{...triggerProps}
				>
					<img
						src="{specialWeaponImageUrl(19)}.avif"
						width="24"
						height="24"
						alt=""
					/>
					{#if screenLegal}
						<Check size={24} class="legalIcon" />
					{:else}
						<X size={24} class="illegalIcon" />
					{/if}
				</Button>
			{/snippet}
			{screenLegal
				? m.q_match_screen_allowed({ special: m.weapons_SPECIAL_19() })
				: m.q_match_screen_ban({ special: m.weapons_SPECIAL_19() })}
		</Popover>
	</span>
{/snippet}

<style>
	.banner {
		position: relative;
		display: grid;
		grid-template-columns: max-content 1fr;
		grid-template-areas: "map info";
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		width: 100%;
		height: var(--banner-height);
		border-radius: var(--radius-box);
		padding: var(--s-2-5);
		background-image:
			linear-gradient(
				to top,
				rgba(0, 0, 0, 0.6),
				rgba(0, 0, 0, 0.6),
				rgba(0, 0, 0, 0.2),
				rgba(0, 0, 0, 0.2),
				rgba(0, 0, 0, 0.6),
				rgba(0, 0, 0, 0.6)
			),
			var(--stage-img);
		color: var(--color-text);
	}

	:global(html.light) .banner {
		color: var(--color-text-inverse);
	}

	.info {
		grid-area: info;
		justify-self: flex-end;
	}

	.map {
		grid-area: map;
		display: flex;
		gap: var(--s-1);
	}

	.screenNoticeRoot {
		display: contents;
	}

	.screenNoticeRoot :global(.notice) {
		position: absolute;
		bottom: var(--s-2);
		right: var(--s-2);
		display: flex;
		gap: var(--s-1);
		align-items: center;
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
		height: auto;
	}

	.joinInfo {
		position: absolute;
		bottom: var(--s-2);
		left: var(--s-2);
		display: flex;
		gap: var(--s-4);
	}

	.joinInfoItem {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}

	.joinInfoLabel {
		text-transform: uppercase;
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		opacity: 0.7;
	}

	.joinInfoValue {
		font-size: var(--font-lg);
		font-weight: var(--weight-bold);
		letter-spacing: 1px;
	}

	.thickText {
		font-size: var(--font-md);
		font-weight: var(--weight-semi);
	}

	.screenNoticeRoot :global(.legalIcon) {
		color: var(--color-success);
	}

	.screenNoticeRoot :global(.illegalIcon) {
		color: var(--color-error);
	}
</style>
