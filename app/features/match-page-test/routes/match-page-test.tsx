import { ArrowLeft } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import { MatchBanner } from "~/components/match-page/MatchBanner";
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

				<MatchBanner stageId={1} mode="SZ">
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
					<MatchBannerBottomRow
						games={[{ mode: "SZ", winner: "ALPHA" }]}
						activeRosters={{
							alpha: [
								{
									id: 1,
									username: "Sendou",
									discordId: "123",
									discordAvatar: null,
									customUrl: "sendou",
								},
							],
							bravo: [
								{
									id: 2,
									username: "Lean",
									discordId: "456",
									discordAvatar: null,
									customUrl: null,
								},
							],
						}}
					/>
				</MatchBanner>
			</MatchPage>
		</Main>
	);
}
