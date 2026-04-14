import { ArrowLeft, Ban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import {
	IconBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import { logger } from "~/utils/logger";
import type { SendouRouteHandle } from "~/utils/remix.server";

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

export default function MatchPageTestRoute() {
	const { t } = useTranslation(["q"]);

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

				<MatchBannerContainer>
					<MatchBannerTopRow
						score={{
							alpha: 1,
							bravo: 2,
							isFinal: false,
							count: 5,
							bestOf: true,
						}}
						time={{
							currentMinutes: 3,
							totalMinutes: 1,
						}}
					/>
					<IconBanner
						icon={<Ban size={32} />}
						header={t("q:match.cancelRequested")}
						subtitle={t("q:match.cancelRequested.subtitle", {
							teamName: "Chimera",
						})}
					/>
					<MatchBannerBottomRow
						games={[
							{ mode: "SZ", winner: "ALPHA" },
							{ mode: "TC", winner: "BRAVO" },
							{ mode: "RM", winner: "ALPHA" },
						]}
						activeRosters={{
							alpha: [
								{
									id: 1,
									username: "Sendou",
									discordId: "123",
									discordAvatar: null,
									customUrl: "sendou",
								},
								{
									id: 2,
									username: "Lean",
									discordId: "456",
									discordAvatar: null,
									customUrl: null,
								},
								{
									id: 3,
									username: "Kiver",
									discordId: "789",
									discordAvatar: null,
									customUrl: null,
								},
								{
									id: 4,
									username: "Brian",
									discordId: "012",
									discordAvatar: null,
									customUrl: null,
								},
							],
							bravo: [
								{
									id: 5,
									username: "Naga",
									discordId: "345",
									discordAvatar: null,
									customUrl: null,
								},
								{
									id: 6,
									username: "Grey",
									discordId: "678",
									discordAvatar: null,
									customUrl: null,
								},
								{
									id: 7,
									username: "Zack",
									discordId: "901",
									discordAvatar: null,
									customUrl: null,
								},
								{
									id: 8,
									username: "Lime",
									discordId: "234",
									discordAvatar: null,
									customUrl: null,
								},
							],
						}}
					/>
				</MatchBannerContainer>

				<MatchTabs tabs={["join", "rosters", "action", "result"]}>
					<MatchJoinTab
						joinLink="https://app.nintendo.net/private_battle/abc123"
						pool="SQ7"
						pass="8430"
						showNoSplatnetAlert
					/>
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
									},
									{
										id: 2,
										username: "Lean",
										discordId: "456",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "DIAMOND", isPlus: false },
									},
									{
										id: 3,
										username: "Kiver",
										discordId: "789",
										discordAvatar: null,
										customUrl: null,
										tier: "CALCULATING",
									},
									{
										id: 4,
										username: "Brian",
										discordId: "012",
										discordAvatar: null,
										customUrl: null,
									},
									{
										id: 9,
										username: "Poppy",
										discordId: "567",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "GOLD", isPlus: true },
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
									},
									{
										id: 6,
										username: "Grey",
										discordId: "678",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "SILVER", isPlus: true },
									},
									{
										id: 7,
										username: "Zack",
										discordId: "901",
										discordAvatar: null,
										customUrl: null,
									},
									{
										id: 8,
										username: "Lime",
										discordId: "234",
										discordAvatar: null,
										customUrl: null,
										tier: { name: "BRONZE", isPlus: false },
									},
								],
							},
						]}
					/>
					<MatchActionTab
						teams={[
							{ id: 1, name: "Chimera" },
							{ id: 2, name: "Koopa Clan" },
						]}
						ownTeamId={1}
						stageId={4}
						mode="SZ"
						withPoints={true}
					/>
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
										},
										skillDifference: { calculated: true, spDiff: 12.3 },
									},
									{
										user: {
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
										},
										skillDifference: { calculated: true, spDiff: 8.7 },
									},
									{
										user: {
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
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
										},
										skillDifference: { calculated: true, spDiff: -11.2 },
									},
									{
										user: {
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
										},
										skillDifference: { calculated: true, spDiff: -9.4 },
									},
									{
										user: {
											id: 7,
											username: "Zack",
											discordId: "901",
											discordAvatar: null,
											customUrl: null,
										},
										skillDifference: { calculated: true, spDiff: -13.8 },
									},
									{
										user: {
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
										},
										skillDifference: { calculated: true, spDiff: -7.6 },
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
										},
										{
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
										},
									],
									bravo: [
										{
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 7,
											username: "Zack",
											discordId: "901",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
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
										},
										{
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
										},
									],
									bravo: [
										{
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 7,
											username: "Zack",
											discordId: "901",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
										},
									],
								},
							},
							{
								stageId: 2,
								mode: "RM",
								timestamp: 1712856200,
								winner: "ALPHA",
								points: [100, 42],
								weapons: {
									alpha: [40, null, 1100, 3040],
									bravo: [null, 210, null, 4010],
								},
								rosters: {
									alpha: [
										{
											id: 1,
											username: "Sendou",
											discordId: "123",
											discordAvatar: null,
											customUrl: "sendou",
										},
										{
											id: 2,
											username: "Lean",
											discordId: "456",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 3,
											username: "Kiver",
											discordId: "789",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 4,
											username: "Brian",
											discordId: "012",
											discordAvatar: null,
											customUrl: null,
										},
									],
									bravo: [
										{
											id: 5,
											username: "Naga",
											discordId: "345",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 6,
											username: "Grey",
											discordId: "678",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 9,
											username: "Poppy",
											discordId: "567",
											discordAvatar: null,
											customUrl: null,
										},
										{
											id: 8,
											username: "Lime",
											discordId: "234",
											discordAvatar: null,
											customUrl: null,
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
