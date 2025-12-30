import type { JSX } from "react";
import { useFetcher } from "react-router";
import { InfoPopover } from "~/components/InfoPopover";
import { LockIcon } from "~/components/icons/Lock";
import { UnlockIcon } from "~/components/icons/Unlock";
import { SubmitButton } from "~/components/SubmitButton";
import { TournamentMatchStatus } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import styles from "../tournament-bracket.module.css";

const lockingInfo =
	"You can lock the match to indicate that it should not be started before the cast is ready. Match being locked prevents score reporting and hides the map list till the organizer/streamer unlocks it.";
const setAsCastedInfo =
	"Select the Twitch account that is currently casting this match. It is then indicated in the bracket view.";

export function CastInfo({
	matchIsOngoing,
	matchId,
	matchIsOver,
	matchStatus,
}: {
	matchIsOngoing: boolean;
	matchId: number;
	matchIsOver: boolean;
	matchStatus: number;
}) {
	const user = useUser();
	const tournament = useTournament();

	const castedMatchesInfo = tournament.ctx.castedMatchesInfo;
	const castTwitchAccounts = tournament.ctx.castTwitchAccounts ?? [];
	const currentlyCastedOn = castedMatchesInfo?.castedMatches.find(
		(cm) => cm.matchId === matchId,
	)?.twitchAccount;
	const isLocked = castedMatchesInfo?.lockedMatches?.includes(matchId);

	const hasPerms = tournament.isOrganizerOrStreamer(user);

	if (castTwitchAccounts.length === 0 || !hasPerms || matchIsOver) return null;

	// match can only be locked when status is Locked or Waiting (team(s) busy with previous match)
	if (
		(matchStatus === TournamentMatchStatus.Locked ||
			matchStatus === TournamentMatchStatus.Waiting) &&
		!isLocked
	) {
		return (
			<CastInfoWrapper
				submitButtonText="Lock to be casted"
				_action="LOCK"
				icon={<LockIcon />}
				infoText={lockingInfo}
			/>
		);
	}

	// if for some reason match is locked in the DB but also has scores reported then the UI
	// will act as if it's not locked at all
	if (!matchIsOngoing && isLocked) {
		return (
			<CastInfoWrapper
				submitButtonText="Unlock"
				_action="UNLOCK"
				icon={<UnlockIcon />}
				infoText={lockingInfo}
			/>
		);
	}

	return (
		<CastInfoWrapper
			submitButtonText="Save"
			_action="SET_AS_CASTED"
			infoText={setAsCastedInfo}
		>
			<select
				name="twitchAccount"
				id="twitchAccount"
				defaultValue={currentlyCastedOn ?? "null"}
				data-testid="cast-info-select"
			>
				<option value="null">Not casted</option>
				{castTwitchAccounts.map((account) => (
					<option key={account} value={account}>
						{account}
					</option>
				))}
			</select>
		</CastInfoWrapper>
	);
}

function CastInfoWrapper({
	children,
	icon,
	submitButtonText,
	_action,
	infoText,
}: {
	children?: React.ReactNode;
	icon?: JSX.Element;
	submitButtonText?: string;
	_action?: string;
	infoText?: string;
}) {
	const fetcher = useFetcher();

	return (
		<div className="stack horizontal sm justify-center items-center">
			<fetcher.Form className={styles.castInfoContainer} method="post">
				<div className={styles.castInfoContainerLabel}>Cast</div>

				<div className="stack horizontal sm items-center justify-between w-full">
					{children ? (
						<div className={styles.castInfoContainerContent}>{children}</div>
					) : null}
					{submitButtonText && _action ? (
						<SubmitButton
							className="mr-2"
							state={fetcher.state}
							_action={_action}
							icon={icon}
							testId="cast-info-submit-button"
						>
							{submitButtonText}
						</SubmitButton>
					) : null}
				</div>
			</fetcher.Form>
			{infoText ? <InfoPopover>{infoText}</InfoPopover> : null}
		</div>
	);
}
