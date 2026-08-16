import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { frontPageSchema } from "~/features/sendouq/q-action-schemas";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { SENDOUQ_PAGE } from "~/utils/urls";
import * as RejoinVote from "../core/RejoinVote";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { matchSchema } from "../q-match-schemas";
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
}: {
	viewerGroup: NonNullable<SendouQMatchLoaderData["match"]["groupAlpha"]>;
}) {
	const { t } = useTranslation(["q"]);
	const lookAgain = useActionSubmit(matchSchema);

	return (
		<div className="stack md items-center">
			<SendouButton
				variant="primary"
				isPending={lookAgain.state !== "idle"}
				onPress={() => {
					lookAgain.submit("LOOK_AGAIN", {
						previousGroupId: viewerGroup.id,
					});
				}}
			>
				{t("q:match.actions.lookAgain")}
			</SendouButton>
		</div>
	);
}

function DeclinedSection() {
	const { t } = useTranslation(["q"]);
	const rejoinQueue = useActionSubmit(frontPageSchema, {
		action: SENDOUQ_PAGE,
	});
	return (
		<div className="stack md items-center">
			<p className="text-lighter text-sm text-center">
				{t("q:match.rematch.declined")}
			</p>
			<SendouButton
				variant="minimal"
				className="text-sm font-bold"
				isPending={rejoinQueue.state !== "idle"}
				onPress={() => {
					rejoinQueue.submit("JOIN_QUEUE", { direct: "true" });
				}}
			>
				{t("q:match.rematch.rejoinQueue")}
			</SendouButton>
		</div>
	);
}

export function OffSeasonRejoinSection() {
	const { t } = useTranslation(["q"]);
	return (
		<p className="text-lighter text-sm text-center">
			{t("q:match.rematch.offSeason")}
		</p>
	);
}
