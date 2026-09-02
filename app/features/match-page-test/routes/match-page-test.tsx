import { ArrowLeft, Ban, Undo2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Main } from "~/components/Main";
import { MatchActionPickBanTab } from "~/components/match-page/MatchActionPickBanTab";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import {
	IconBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTimer } from "~/components/match-page/MatchBannerTimer";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import type { ObjectiveTimelineEvent } from "~/components/ObjectiveTimeline";
import type { PlayerStatusTimelineSample } from "~/components/PlayerStatusTimeline";
import { logger } from "~/utils/logger";
import type { SendouRouteHandle } from "~/utils/remix.server";

/** Counter reads of a made-up zones game, for previewing the timeline chart. */
const MOCK_OBJECTIVE_EVENTS = mockObjectiveEvents();

/** Icon-strip reads of the same made-up game, for previewing the status bands. */
const MOCK_PLAYER_STATUS_SAMPLES = mockPlayerStatusSamples();

type ActionVariant =
	| "winner"
	| "counterpick-stage"
	| "ban-stage"
	| "ban-stage-only"
	| "pick-mode"
	| "ban-mode";

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

export default function MatchPageTestRoute() {
	const { t } = useTranslation(["q"]);
	const [actionVariant, setActionVariant] = useState<ActionVariant>("winner");

	return (
		<Main>
			<MatchPage>
				<MatchPageHeader
					subtitle="Mola Mola"
					topRight={
						<SendouButton variant="outlined" size="small" icon={<ArrowLeft />}>
							Back to bracket
						</SendouButton>
					}
				>
					Round 2.1
				</MatchPageHeader>

				<SendouTabs
					selectedKey={actionVariant}
					onSelectionChange={(key) => setActionVariant(key as ActionVariant)}
					disappearing={false}
					padded={false}
				>
					<SendouTabList>
						<SendouTab id="winner">Winner</SendouTab>
						<SendouTab id="counterpick-stage">Counterpick</SendouTab>
						<SendouTab id="ban-stage">Ban stage</SendouTab>
						<SendouTab id="ban-stage-only">Ban stage (any mode)</SendouTab>
						<SendouTab id="pick-mode">Pick mode</SendouTab>
						<SendouTab id="ban-mode">Ban mode</SendouTab>
					</SendouTabList>
				</SendouTabs>

				<MatchBannerContainer>
					<MatchBannerTopRow
						score={{
							alpha: 1,
							bravo: 2,
							isFinal: false,
							count: 5,
							bestOf: true,
						}}
					>
						<MatchBannerTimer
							time={{
								currentMinutes: 3,
								totalMinutes: 1,
							}}
						/>
					</MatchBannerTopRow>
					<IconBanner
						icon={<Ban size={32} />}
						header={t("q:match.cancelRequested")}
						subtitle={t("q:match.cancelRequested.subtitle", {
							teamName: "Chimera",
						})}
						screenLegal={false}
						joinPool="SQ7"
						joinPass="8430"
					/>
					<MatchBannerBottomRow
						games={[{ mode: "SZ" }, { mode: "TC" }, { mode: "RM" }]}
						activeRosters={{
							alpha: [
								{
									id: 1,
									username: "Sendou",
									discordId: "123",
									discordAvatar: null,
									customUrl: "sendou",
									customAvatarUrl: null,
								},
								{
									id: 2,
									username: "Lean",
									discordId: "456",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
								{
									id: 3,
									username: "Kiver",
									discordId: "789",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
								{
									id: 4,
									username: "Brian",
									discordId: "012",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
							],
							bravo: [
								{
									id: 5,
									username: "Naga",
									discordId: "345",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
								{
									id: 6,
									username: "Grey",
									discordId: "678",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
								{
									id: 7,
									username: "Zack",
									discordId: "901",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
								{
									id: 8,
									username: "Lime",
									discordId: "234",
									discordAvatar: null,
									customUrl: null,
									customAvatarUrl: null,
								},
							],
						}}
					/>
				</MatchBannerContainer>

				<MatchTabs tabs={["rosters", "action", "result"]}>
					<MatchRosterTab
						minMembersPerTeam={4}
						canEditSubbedOut={[true, false]}
						onSubbedOutChange={(teamId, subbedOut) => {
							logger.info("onSubbedOutChange", { teamId, subbedOut });
						}}
						teams={[
							{
								team: {
									id: 1,
									name: "me in japan",
									url: "/t/me-in-japan",
								},
								tier: { name: "DIAMOND", isPlus: true },
								members: [
									{
										id: 1,
										username: "Sendou",
										discordId: "123",
										discordAvatar: null,
										customUrl: "sendou",
										tier: { name: "LEVIATHAN", isPlus: true },
										weaponPool: [0, 2000, 4000],
										customAvatarUrl: null,
									},
									{
										id: 2,
										username: "Lean",
										discordId: "456",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "DIAMOND", isPlus: false },
										weaponPool: [20, 1100],
										customAvatarUrl: null,
									},
									{
										id: 3,
										username: "Kiver",
										discordId: "789",
										discordAvatar: null,
										customUrl: null,
										tier: "CALCULATING",
										customAvatarUrl: null,
									},
									{
										id: 4,
										username: "Brian",
										discordId: "012",
										discordAvatar: null,
										customUrl: null,
										customAvatarUrl: null,
									},
									{
										id: 9,
										username: "Poppy",
										discordId: "567",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "GOLD", isPlus: true },
										customAvatarUrl: null,
									},
								],
								subbedOut: [9],
							},
							{
								defaultName: "Group Bravo",
								members: [
									{
										id: 5,
										username: "Naga",
										discordId: "345",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "PLATINUM", isPlus: false },
										weaponPool: [40, 3000],
										customAvatarUrl: null,
									},
									{
										id: 6,
										username: "Grey",
										discordId: "678",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "SILVER", isPlus: true },
										customAvatarUrl: null,
									},
									{
										id: 7,
										username: "Zack",
										discordId: "901",
										discordAvatar: null,
										customUrl: null,
										customAvatarUrl: null,
									},
									{
										id: 8,
										username: "Lime",
										discordId: "234",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "BRONZE", isPlus: false },
										customAvatarUrl: null,
									},
								],
							},
						]}
					/>
					{actionVariant === "winner" ? (
						<MatchActionTab
							teams={[
								{ id: 1, name: "Chimera" },
								{ id: 2, name: "Koopa Clan" },
							]}
							ownTeamId={1}
							stageId={4}
							mode="SZ"
							withKo={true}
							actionButtons={
								<SendouButton
									variant="minimal-destructive"
									size="miniscule"
									icon={<Undo2 size={16} />}
								>
									{t("q:match.undoReport")}
								</SendouButton>
							}
						/>
					) : actionVariant === "counterpick-stage" ? (
						<MatchActionPickBanTab
							type="PICK"
							options={[
								{ stageId: 1, mode: "SZ", picker: "US" },
								{ stageId: 2, mode: "SZ", picker: "BOTH" },
								{ stageId: 3, mode: "SZ", picker: "THEM" },
								{ stageId: 4, mode: "TC", picker: "US" },
								{ stageId: 5, mode: "TC", picker: "THEM" },
								{ stageId: 6, mode: "RM", picker: "BOTH" },
								{ stageId: 7, mode: "RM", picker: "US" },
							]}
							onSubmit={(data) => logger.info("pick submit", data)}
						/>
					) : actionVariant === "ban-stage" ? (
						<MatchActionPickBanTab
							type="BAN"
							options={[
								{ stageId: 1, mode: "SZ", nth: 1 },
								{ stageId: 2, mode: "SZ", nth: 2 },
								{ stageId: 4, mode: "TC", nth: 3 },
								{ stageId: 5, mode: "TC", nth: 4 },
								{ stageId: 6, mode: "RM", nth: 5 },
								{ stageId: 7, mode: "RM", nth: 6 },
								{ stageId: 8, mode: "CB", nth: 7 },
								{ stageId: 9, mode: "CB", nth: 8 },
							]}
							onSubmit={(data) => logger.info("ban submit", data)}
						/>
					) : actionVariant === "ban-stage-only" ? (
						<MatchActionPickBanTab
							type="BAN"
							options={[
								{ stageId: 1 },
								{ stageId: 2 },
								{ stageId: 3 },
								{ stageId: 4 },
								{ stageId: 5 },
								{ stageId: 6 },
								{ stageId: 7 },
								{ stageId: 8 },
								{ stageId: 9 },
							]}
							onSubmit={(data) => logger.info("ban stage-only submit", data)}
						/>
					) : actionVariant === "pick-mode" ? (
						<MatchActionPickBanTab
							type="PICK"
							options={[
								{ mode: "SZ" },
								{ mode: "TC" },
								{ mode: "RM" },
								{ mode: "CB" },
							]}
							onSubmit={(data) => logger.info("pick mode submit", data)}
						/>
					) : (
						<MatchActionPickBanTab
							type="BAN"
							options={[
								{ mode: "SZ" },
								{ mode: "TC" },
								{ mode: "RM" },
								{ mode: "CB" },
							]}
							onSubmit={(data) => logger.info("ban mode submit", data)}
						/>
					)}
					<MatchResultTab
						teams={{
							alpha: { name: "me in japan" },
							bravo: { name: "Group Bravo" },
						}}
						score={{ alpha: 3, bravo: 0 }}
						spChanges={{
							alpha: {
								members: [
									{
										user: {
											id: 1,
											username: "Sendou",
											discordId: "123",
											discordAvatar: null,
											customUrl: "sendou",
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: true,
											spDiff: 12.3,
											oldSp: 1402.43,
											newSp: 1414.73,
										},
									},
									{
										user: {
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: true,
											spDiff: 8.7,
											oldSp: 1521.18,
											newSp: 1529.88,
										},
									},
									{
										user: {
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: false,
											matchesCount: 3,
											matchesCountNeeded: 7,
										},
									},
									{
										user: {
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: false,
											matchesCount: 7,
											matchesCountNeeded: 7,
											newSp: 1850,
										},
									},
								],
								skillDifference: {
									calculated: false,
									matchesCount: 5,
									matchesCountNeeded: 7,
								},
							},
							bravo: {
								members: [
									{
										user: {
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: true,
											spDiff: -11.2,
											oldSp: 1612.55,
											newSp: 1601.35,
										},
									},
									{
										user: {
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: true,
											spDiff: -9.4,
											oldSp: 1488.62,
											newSp: 1479.22,
										},
									},
									{
										user: {
											id: 7,
											username: "Zack",
											discordId: "901",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: true,
											spDiff: -13.8,
											oldSp: 1730.91,
											newSp: 1717.11,
										},
									},
									{
										user: {
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										skillDifference: {
											calculated: true,
											spDiff: -7.6,
											oldSp: 1555.04,
											newSp: 1547.44,
										},
									},
								],
								skillDifference: {
									calculated: true,
									oldSp: 1980,
									newSp: 1968,
								},
							},
						}}
						maps={[
							{
								stageId: 1,
								mode: "SZ",
								timestamp: 1712855000,
								winner: "ALPHA",
								weapons: {
									alpha: [40, 10, 1100, 3040],
									bravo: [50, 210, 2010, 4010],
								},
								rosters: {
									alpha: [
										{
											id: 1,
											username: "Sendou",
											discordId: "123",
											discordAvatar: null,
											customUrl: "sendou",
											customAvatarUrl: null,
										},
										{
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
									],
									bravo: [
										{
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 7,
											username: "Zack",
											discordId: "901",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
									],
								},
							},
							{
								stageId: 4,
								mode: "TC",
								timestamp: 1712855600,
								winner: "ALPHA",
								weapons: {
									alpha: [40, 10, 1100, 3040],
									bravo: [50, 210, 2010, 4010],
								},
								rosters: {
									alpha: [
										{
											id: 1,
											username: "Sendou",
											discordId: "123",
											discordAvatar: null,
											customUrl: "sendou",
											customAvatarUrl: null,
										},
										{
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
									],
									bravo: [
										{
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 7,
											username: "Zack",
											discordId: "901",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
									],
								},
							},
							{
								stageId: 2,
								mode: "RM",
								timestamp: 1712856200,
								winner: "ALPHA",
								ko: true,
								weapons: {
									alpha: [40, null, 1100, 3040],
									bravo: [null, 210, null, 4010],
								},
								scoreboard: {
									objective: MOCK_OBJECTIVE_EVENTS,
									playerStatus: MOCK_PLAYER_STATUS_SAMPLES,
									scores: [100, 0],
									alpha: [
										{
											name: "Sendou",
											weaponSplId: 40,
											ka: 12,
											d: 4,
											s: 3,
											paint: 1102,
											abilities: [
												["LDE", "IRU", "IRU", "SCU"],
												["SPU", "ISM", "ISM", "SCU"],
												["SCU", "QSJ", "SRU", "SCU"],
											],
										},
										{
											name: "Lean",
											weaponSplId: 1100,
											ka: 9,
											d: 6,
											s: 2,
											paint: 987,
										},
										{
											name: "Kiver",
											weaponSplId: 3040,
											ka: 7,
											d: 5,
											s: 4,
											paint: 1345,
										},
										{
											name: "Brian",
											weaponSplId: null,
											ka: null,
											d: null,
											s: null,
											paint: null,
										},
									],
									bravo: [
										{
											name: "Naga",
											weaponSplId: 210,
											ka: 8,
											d: 7,
											s: 1,
											paint: 876,
											abilities: [
												["CB", "SPU", "SPU", "SPU"],
												["SCU", "SCU", "SS", "SCU"],
												["SJ", "SRU", "QSJ", "QSJ"],
											],
										},
										{
											name: "Grey",
											weaponSplId: 4010,
											ka: 5,
											d: 8,
											s: 2,
											paint: 1204,
										},
										{
											name: "Poppy",
											weaponSplId: 50,
											ka: 6,
											d: 9,
											s: 3,
											paint: 743,
										},
										{
											name: "Lime",
											weaponSplId: 2010,
											ka: 4,
											d: 10,
											s: 1,
											paint: 654,
										},
									],
								},
								rosters: {
									alpha: [
										{
											id: 1,
											username: "Sendou",
											discordId: "123",
											discordAvatar: null,
											customUrl: "sendou",
											customAvatarUrl: null,
										},
										{
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
									],
									bravo: [
										{
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 9,
											username: "Poppy",
											discordId: "567",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
										{
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
											customAvatarUrl: null,
										},
									],
								},
							},
						]}
					/>
				</MatchTabs>
			</MatchPage>
		</Main>
	);
}

/**
 * Zones game second by second: the controlling side burns its penalty before its count moves,
 * and losing the zone after counting hands it a penalty to burn next time.
 */
function mockObjectiveEvents(): ObjectiveTimelineEvent[] {
	const PHASES: Array<{ seconds: number; control: [boolean, boolean] }> = [
		{ seconds: 12, control: [false, false] },
		{ seconds: 30, control: [true, false] },
		{ seconds: 14, control: [false, false] },
		{ seconds: 44, control: [false, true] },
		{ seconds: 10, control: [false, false] },
		{ seconds: 80, control: [true, false] },
	];
	const PENALTY_ON_LOSING_ZONE = 12;
	const SAMPLE_EVERY_SECONDS = 2;

	const score: [number, number] = [100, 100];
	const penalty: [number, number] = [0, 0];
	const events: ObjectiveTimelineEvent[] = [];
	let previousControl: [boolean, boolean] = [false, false];
	let t = 0;

	for (const phase of PHASES) {
		for (const side of [0, 1] as const) {
			if (previousControl[side] && !phase.control[side]) {
				penalty[side] += PENALTY_ON_LOSING_ZONE;
			}
		}
		previousControl = phase.control;

		for (let second = 0; second < phase.seconds; second++) {
			for (const side of [0, 1] as const) {
				if (!phase.control[side]) continue;
				if (penalty[side] > 0) penalty[side] -= 1;
				else score[side] = Math.max(0, score[side] - 1);
			}

			t += 1;
			if (t % SAMPLE_EVERY_SECONDS !== 0) continue;
			events.push({
				t,
				data: {
					time: 300 - t,
					score: [score[0], score[1]],
					penalty: [penalty[0] || null, penalty[1] || null],
					control: [phase.control[0], phase.control[1]],
				},
			});
		}
	}

	return events;
}

/** Staggered respawn and special cycles per player over the `mockObjectiveEvents` game, same cadence. */
function mockPlayerStatusSamples(): PlayerStatusTimelineSample[] {
	const DURATION_SECONDS = 190;
	const SAMPLE_EVERY_SECONDS = 2;

	const samples: PlayerStatusTimelineSample[] = [];
	for (
		let t = SAMPLE_EVERY_SECONDS;
		t <= DURATION_SECONDS;
		t += SAMPLE_EVERY_SECONDS
	) {
		const flags = (kind: "dead" | "special", side: number) =>
			[0, 1, 2, 3].map((slot) => {
				const phase = t + slot * 17 + side * 31;
				return kind === "dead" ? phase % 61 < 8 : phase % 47 < 12;
			}) as [boolean, boolean, boolean, boolean];

		samples.push({
			t,
			dead: [flags("dead", 0), flags("dead", 1)],
			special: [flags("special", 0), flags("special", 1)],
		});
	}
	return samples;
}
