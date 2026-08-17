<script lang="ts">
import { Ban, Swords } from "@lucide/svelte";
import IconBanner from "#lib/components/match-page/IconBanner.svelte";
import MatchBanner from "#lib/components/match-page/MatchBanner.svelte";
import MatchBannerContainer from "#lib/components/match-page/MatchBannerContainer.svelte";
import MatchBannerScheduledTime from "#lib/components/match-page/MatchBannerScheduledTime.svelte";
import MatchBannerTopRow from "#lib/components/match-page/MatchBannerTopRow.svelte";
import { resolveRoomPass } from "#lib/components/match-page/match-page-utils.ts";
import { m } from "#lib/paraglide/messages.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import * as Scrim from "../Scrim.ts";
import type { ScrimPageData } from "../scrims.remote.ts";

interface Props {
	data: ScrimPageData;
}

let { data }: Props = $props();

const screenLegal = $derived(!data.anyUserPrefersNoScreen);

const acceptedRequest = $derived(
	data.post.requests.find((r) => r.isAccepted),
);
const scheduledAt = $derived(
	databaseTimestampToDate(acceptedRequest?.startsAt ?? data.post.startsAt),
);

const joinPool = $derived(Scrim.resolvePoolCode(data.post.id));
const joinPass = $derived(resolveRoomPass(data.post.id));

const currentMap = $derived(data.mapByMap.currentMap);
</script>

{#snippet topRow()}
	<MatchBannerTopRow>
		<MatchBannerScheduledTime time={scheduledAt} />
	</MatchBannerTopRow>
{/snippet}

{#if data.post.canceled}
	<MatchBannerContainer>
		{@render topRow()}
		<IconBanner
			header={m.scrims_banner_canceled_header({
				user: data.post.canceled.byUser.username,
			})}
			subtitle={m.scrims_banner_canceled_subtitle({
				reason: data.post.canceled.reason,
			})}
		>
			{#snippet icon()}<Ban size={32} />{/snippet}
		</IconBanner>
	</MatchBannerContainer>
{:else if currentMap}
	<MatchBannerContainer>
		{@render topRow()}
		<MatchBanner
			stageId={currentMap.stageId}
			mode={currentMap.mode}
			{screenLegal}
			{joinPool}
			{joinPass}
		/>
	</MatchBannerContainer>
{:else}
	<MatchBannerContainer>
		{@render topRow()}
		<IconBanner
			header={m.scrims_banner_freeForm_header()}
			subtitle={m.scrims_banner_freeForm_subtitle()}
			{screenLegal}
			{joinPool}
			{joinPass}
		>
			{#snippet icon()}<Swords size={32} />{/snippet}
		</IconBanner>
	</MatchBannerContainer>
{/if}
