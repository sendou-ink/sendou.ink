import { Check, Clock, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
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
	isPending: boolean;
	onVote: (isContinuing: boolean) => void;
};

// xxx: if Voting no, form with confirm with a warning they cant later change their mind?

export function RematchVotePanel({
	members,
	votes,
	viewerUserId,
	isPending,
	onVote,
}: RematchVotePanelProps) {
	const { t } = useTranslation(["q"]);

	const currentRoundSize = RejoinVote.currentUserIds(
		votes,
		members.map((m) => m.id),
	).length;

	return (
		<div className={styles.root}>
			<div className={styles.prompt}>
				{t("q:match.rematch.prompt", { count: currentRoundSize })}
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
			{RejoinVote.userContinueStatus(votes, viewerUserId) === false ? null : (
				<div className={styles.buttons}>
					<SendouButton
						variant="outlined"
						size="small"
						isDisabled={isPending}
						onPress={() => onVote(false)}
					>
						{t("q:match.rematch.vote.no")}
					</SendouButton>
					<SendouButton
						variant="primary"
						size="small"
						isDisabled={
							isPending ||
							RejoinVote.userContinueStatus(votes, viewerUserId) === true
						}
						onPress={() => onVote(true)}
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
