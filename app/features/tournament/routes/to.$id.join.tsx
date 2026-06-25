import { ClipboardList, DoorOpen, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Form, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { LinkButton } from "~/components/elements/Button";
import { FriendCodeInput } from "~/components/FriendCodeInput";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import {
	tournamentRegisterPage,
	tournamentTeamPage,
	userEditProfilePage,
} from "~/utils/urls";
import { action } from "../actions/to.$id.join.server";
import { loader } from "../loaders/to.$id.join.server";
import styles from "../tournament.module.css";
import { validateCanJoinTeam } from "../tournament-utils";
import { useTournament } from "./to.$id";

export { action, loader };

export default function JoinTeamPage() {
	const { t } = useTranslation(["tournament", "common"]);
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	const teamToJoin = data.teamId ? tournament.teamById(data.teamId) : undefined;
	const teamMemberOf = tournament.teamMemberOfByUser(user);
	const validationStatus = validateCanJoinTeam({
		inviteCode: data.inviteCode,
		teamToJoin,
		userId: user?.id,
		maxTeamSize: tournament.maxMembersPerTeam,
	});

	const isAlreadyInAnotherTeam =
		validationStatus === "VALID" && Boolean(teamMemberOf);

	const textPrompt = () => {
		switch (validationStatus) {
			case "MISSING_CODE":
			case "SHORT_CODE":
			case "NO_TEAM_MATCHING_CODE":
			case "TEAM_FULL":
			case "ALREADY_JOINED":
			case "NOT_LOGGED_IN":
				return t(`tournament:join.error.${validationStatus}`);
			case "VALID": {
				invariant(teamToJoin);

				return t("tournament:join.VALID", {
					teamName: teamToJoin.name,
					eventName: tournament.ctx.name,
				});
			}
			default: {
				assertUnreachable(validationStatus);
			}
		}
	};

	if (tournament.ctx.settings.requireInGameNames && user && !user.inGameName) {
		return (
			<Alert variation="WARNING" alertClassName="w-max">
				<div className="stack horizontal sm items-center flex-wrap justify-center text-center">
					This tournament requires you to have an in-game name set{" "}
					<LinkButton to={userEditProfilePage(user)} size="small">
						Edit profile
					</LinkButton>
				</div>
			</Alert>
		);
	}

	return (
		<div className="stack md items-center">
			{isAlreadyInAnotherTeam || validationStatus === "TEAM_FULL" ? (
				<Alert variation="WARNING" alertClassName={styles.joinAlert}>
					{isAlreadyInAnotherTeam
						? t("tournament:join.alreadyInTeam")
						: textPrompt()}
				</Alert>
			) : (
				<div className="text-center font-semi-bold">{textPrompt()}</div>
			)}
			{isAlreadyInAnotherTeam ? (
				<LinkButton
					to={tournamentRegisterPage(tournament.ctx.id)}
					size="small"
					variant="outlined"
					icon={<ClipboardList />}
				>
					{t("tournament:join.viewRegistration")}
				</LinkButton>
			) : teamMemberOf ? (
				<LinkButton
					to={tournamentTeamPage({
						tournamentId: tournament.ctx.id,
						tournamentTeamId: teamMemberOf.id,
					})}
					size="small"
					variant="outlined"
					icon={<Users />}
				>
					{t("tournament:join.viewTeam")}
				</LinkButton>
			) : null}
			{validationStatus === "VALID" && !isAlreadyInAnotherTeam ? (
				<div className="text-lighter text-center font-semi-bold text-sm">
					<FriendCodeInput friendCode={user?.friendCode} />
					{user?.inGameName ? (
						<div className="font-bold">IGN {user.inGameName}</div>
					) : null}
				</div>
			) : null}
			<Form method="post" className={styles.inviteContainer}>
				{validationStatus === "VALID" && !isAlreadyInAnotherTeam ? (
					<div className="stack md items-center">
						<SubmitButton isDisabled={!user?.friendCode} icon={<DoorOpen />}>
							{t("common:actions.join")}
						</SubmitButton>
						{!user?.friendCode ? (
							<div className="text-warning">
								Save friend code before joining the team
							</div>
						) : (
							<div className="text-lighter text-xs text-center">
								{t("tournament:join.friendSuggestion")}
							</div>
						)}
					</div>
				) : null}
			</Form>
		</div>
	);
}
