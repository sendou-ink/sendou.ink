import { Check, Clock, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type FetcherWithComponents, Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import * as RejoinVote from "../core/RejoinVote";
import styles from "./RematchVotePanel.module.css";

export type RematchVoteMember = {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customUrl: string | null;
};

type RematchVotePanelProps = {
	members: RematchVoteMember[];
	votes: RejoinVote.RejoinVote[];
	viewerUserId: number;
	fetcher: FetcherWithComponents<any>;
};

export function RematchVotePanel({
	members,
	votes,
	viewerUserId,
	fetcher,
}: RematchVotePanelProps) {
	const { t } = useTranslation(["q"]);

	const isPending = fetcher.state !== "idle";

	const currentRoundSize = RejoinVote.currentUserIds(
		votes,
		members.map((m) => m.id),
	).length;

	const voteResolved = RejoinVote.result(votes).type === "RESOLVED";
	const viewerVotedYes =
		RejoinVote.userContinueStatus(votes, viewerUserId) === true;
	const viewerVotedNo =
		RejoinVote.userContinueStatus(votes, viewerUserId) === false;

	return (
		<div className={styles.root}>
			<div className={styles.prompt}>
				{voteResolved
					? t("q:match.rematch.resolved", { count: currentRoundSize })
					: t("q:match.rematch.prompt", { count: currentRoundSize })}
			</div>
			<ul className={styles.list}>
				{members.map((member) => {
					const status = RejoinVote.userContinueStatus(votes, member.id);
					return (
						<li key={member.id} className={styles.row}>
							<Avatar user={member} size="xxs" />
							<span className={styles.username}>{member.username}</span>
							<StatusIcon status={status} />
						</li>
					);
				})}
			</ul>
			{voteResolved && viewerVotedYes ? (
				<div className={styles.buttons}>
					<Link to={SENDOUQ_LOOKING_PAGE}>
						<SendouButton variant="primary" size="small" icon={<RotateCcw />}>
							{t("q:match.rematch.backToQueue")}
						</SendouButton>
					</Link>
				</div>
			) : viewerVotedNo ? null : (
				<div className={styles.buttons}>
					<FormWithConfirm
						fields={[
							["_action", "CAST_CONTINUE_VOTE"],
							["isContinuing", "0"],
						]}
						dialogHeading={t("q:match.rematch.vote.noConfirm")}
						submitButtonText={t("q:match.rematch.vote.no")}
						fetcher={fetcher}
					>
						<SendouButton
							variant="outlined"
							size="small"
							isDisabled={isPending}
						>
							{t("q:match.rematch.vote.no")}
						</SendouButton>
					</FormWithConfirm>
					<SendouButton
						variant="primary"
						size="small"
						isDisabled={isPending || viewerVotedYes}
						onPress={() =>
							fetcher.submit(
								{
									_action: "CAST_CONTINUE_VOTE",
									isContinuing: "1",
								},
								{ method: "post" },
							)
						}
					>
						{t("q:match.rematch.vote.yes")}
					</SendouButton>
				</div>
			)}
		</div>
	);
}

function StatusIcon({ status }: { status: boolean | null }) {
	if (status === true) {
		return (
			<Check size={18} className={styles.iconYes} aria-label="voted yes" />
		);
	}
	if (status === false) {
		return <X size={18} className={styles.iconNo} aria-label="voted no" />;
	}
	return (
		<Clock size={18} className={styles.iconPending} aria-label="pending" />
	);
}
