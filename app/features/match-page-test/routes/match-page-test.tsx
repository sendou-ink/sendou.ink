import { ArrowLeft } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import {
	MatchBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";

export default function MatchPageTestRoute() {
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
					<MatchBanner stageId={1} mode="SZ" screenLegal={false}>
						Team 2 pick
					</MatchBanner>
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
			</MatchPage>
		</Main>
	);
}
