import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import { sub } from "date-fns";
import * as React from "react";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { soundEnabled, soundVolume } from "~/features/chat/chat-utils";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { logger } from "~/utils/logger";
import {
	soundPath,
	tournamentMatchPage,
	tournamentRegisterPage,
} from "~/utils/urls";
import styles from "../tournament-bracket.module.css";

export function TournamentTeamActions() {
	const tournament = useTournament();
	const user = useUser();
	const fetcher = useFetcher();

	const status = tournament.teamMemberOfProgressStatus(user);

	useMatchReadySound(status?.type);

	if (!status) return null;

	if (status.type === "MATCH") {
		return (
			<Container spaced="very">
				vs. {status.opponent}
				<LinkButton
					to={tournamentMatchPage({
						tournamentId: tournament.ctx.id,
						matchId: status.matchId,
					})}
					variant="minimal"
					size="small"
				>
					Go to match
				</LinkButton>
			</Container>
		);
	}
	if (status.type === "CHECKIN") {
		const bracket = tournament.brackets[status.bracketIdx ?? -1];

		if (!bracket) {
			return (
				<Container spaced="very">
					Your team needs to check-in
					<fetcher.Form
						method="post"
						action={tournamentRegisterPage(tournament.ctx.id)}
					>
						<input type="hidden" name="bracketIdx" value={status.bracketIdx} />
						{status.canCheckIn ? (
							<SubmitButton
								size="small"
								variant="minimal"
								_action="CHECK_IN"
								state={fetcher.state}
								testId="check-in-bracket-button"
							>
								Check-in now
							</SubmitButton>
						) : (
							<SendouPopover
								trigger={
									<SendouButton variant="minimal" size="small">
										Check-in now
									</SendouButton>
								}
							>
								{tournament.ctx.mapPickingStyle !== "TO"
									? "Can't check-in, registration needs to be finished by the captain (full roster & map pool picked)"
									: "Can't check-in, registration needs to be finished by the captain (full roster)"}
							</SendouPopover>
						)}
					</fetcher.Form>
				</Container>
			);
		}

		return (
			<Container spaced="very">
				{bracket.name} check-in
				{bracket.canCheckIn(user) ? (
					<fetcher.Form method="post">
						<input type="hidden" name="bracketIdx" value={status.bracketIdx} />
						<SubmitButton
							size="small"
							variant="minimal"
							_action="BRACKET_CHECK_IN"
							state={fetcher.state}
							testId="check-in-bracket-button"
						>
							Check-in
						</SubmitButton>
					</fetcher.Form>
				) : bracket.startTime && bracket.startTime > new Date() ? (
					<span className="text-lighter text-xxs" suppressHydrationWarning>
						open{" "}
						{sub(bracket.startTime, { hours: 1 }).toLocaleTimeString("en-US", {
							hour: "numeric",
							minute: "numeric",
							weekday: "short",
						})}{" "}
						-{" "}
						{bracket.startTime.toLocaleTimeString("en-US", {
							hour: "numeric",
							minute: "numeric",
						})}
					</span>
				) : bracket.startTime && bracket.startTime < new Date() ? (
					<span className="text-warning">over</span>
				) : null}
			</Container>
		);
	}

	if (status.type === "WAITING_FOR_MATCH") {
		return (
			<Container>
				Waiting on match
				<Dots />
			</Container>
		);
	}

	if (status.type === "WAITING_FOR_CAST") {
		return (
			<Container>
				Waiting on cast
				<Dots />
			</Container>
		);
	}

	if (status.type === "WAITING_FOR_ROUND") {
		return (
			<Container>
				Waiting on next round
				<Dots />
			</Container>
		);
	}

	if (status.type === "WAITING_FOR_BRACKET") {
		return (
			<Container spaced>
				<CheckmarkIcon className={styles.quickActionCheckmark} />{" "}
				<div>
					Checked in, waiting on bracket
					<Dots />
				</div>
			</Container>
		);
	}

	if (status.type === "THANKS_FOR_PLAYING") {
		return <Container>Thank you for playing!</Container>;
	}

	logger.warn("Unexpected status", status);
	return null;
}

function Container({
	children,
	spaced,
}: {
	children: React.ReactNode;
	spaced?: boolean | "very";
}) {
	return (
		<div
			className={clsx(styles.quickAction, {
				[styles.quickActionSpaced]: spaced,
				[styles.quickActionVerySpaced]: spaced === "very",
			})}
		>
			{children}
		</div>
	);
}

function Dots() {
	const [thirdVisible, setThirdVisible] = React.useState(false);

	React.useEffect(() => {
		const timeout = setInterval(() => {
			setThirdVisible((prev) => !prev);
		}, 1500);

		return () => {
			clearTimeout(timeout);
		};
	}, []);

	return (
		<span>
			..<span className={clsx({ invisible: !thirdVisible })}>.</span>
		</span>
	);
}

function useMatchReadySound(statusType?: string) {
	const isWaiting = React.useRef(false);

	React.useEffect(() => {
		if (statusType === "MATCH" && isWaiting.current) {
			const sound = "tournament_match";

			if (soundEnabled(sound)) {
				const audio = new Audio(soundPath(sound));
				audio.volume = soundVolume() / 100;
				void audio
					.play()
					.catch((e) => logger.error(`Couldn't play sound: ${e}`));
			}
		}

		isWaiting.current = !statusType || statusType?.startsWith("WAITING_");
	}, [statusType]);

	return isWaiting;
}
