import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SENDOUQ_PAGE } from "~/utils/urls";
import * as RejoinVote from "../core/RejoinVote";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { RematchVotePanel } from "./RematchVotePanel";

export function MatchmadeRejoinSection({
	data,
	viewerGroup,
	viewerUserId,
	awaitingConfirmation,
	isOnReporterTeam,
}: {
	data: SendouQMatchLoaderData;
	viewerGroup: NonNullable<SendouQMatchLoaderData["match"]["groupAlpha"]>;
	viewerUserId: number;
	awaitingConfirmation: boolean;
	isOnReporterTeam: boolean;
}) {
	const voteFetcher = useFetcher();

	const votes = RejoinVote.extractOwnGroupVotesFromSendouqMatch(
		data.match,
		viewerUserId,
	);

	if (!votes) return null;

	if (RejoinVote.userContinueStatus(votes, viewerUserId) === false) {
		return <DeclinedSection />;
	}

	// During awaiting confirmation, only reporter team can cascade.
	if (awaitingConfirmation && !isOnReporterTeam) return null;

	return (
		<RematchVotePanel
			members={viewerGroup.members.map((m) => ({
				id: m.id,
				username: m.username,
				discordId: m.discordId,
				discordAvatar: m.discordAvatar,
				customUrl: m.customUrl,
			}))}
			votes={votes}
			viewerUserId={viewerUserId}
			fetcher={voteFetcher}
		/>
	);
}

export function TrustedRejoinSection({
	viewerGroup,
	viewerUserId,
}: {
	viewerGroup: NonNullable<SendouQMatchLoaderData["match"]["groupAlpha"]>;
	viewerUserId: number;
}) {
	const { t } = useTranslation(["q"]);
	const viewerRole = viewerGroup.members.find(
		(m) => m.id === viewerUserId,
	)?.role;
	const lookAgainFetcher = useFetcher();

	if (viewerRole === "OWNER") {
		return (
			<div className="stack md items-center">
				<SendouButton
					variant="primary"
					isPending={lookAgainFetcher.state !== "idle"}
					onPress={() => {
						lookAgainFetcher.submit(
							{
								_action: "LOOK_AGAIN",
								previousGroupId: String(viewerGroup.id),
							},
							{ method: "post" },
						);
					}}
				>
					{t("q:match.actions.lookAgain")}
				</SendouButton>
			</div>
		);
	}

	return (
		<p className="text-lighter text-sm text-center">
			{t("q:match.rematch.waitingCaptain")}
		</p>
	);
}

function DeclinedSection() {
	const { t } = useTranslation(["q"]);
	return (
		<div className="stack md items-center">
			<p className="text-lighter text-sm text-center">
				{t("q:match.rematch.declined")}
			</p>
			<Link to={SENDOUQ_PAGE} className="text-sm">
				{t("q:match.rematch.rejoinQueue")}
			</Link>
		</div>
	);
}
