import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { useLocation } from "react-use";
import { Avatar } from "~/components/Avatar";
import { Badge } from "~/components/Badge";
import { Divider } from "~/components/Divider";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormMessage } from "~/components/FormMessage";
import { Placement } from "~/components/Placement";
import { SubmitButton } from "~/components/SubmitButton";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { TournamentBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { validateBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-utils";
import { ParticipationPill } from "~/features/user-page/components/ParticipationPill";
import invariant from "~/utils/invariant";
import { action } from "../actions/to.$id.brackets.finalize.server";
import {
	type FinalizeTournamentLoaderData,
	loader,
} from "../loaders/to.$id.brackets.finalize.server";
export { action, loader };

export default function TournamentFinalizePage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["tournament"]);
	const location = useLocation();
	const [isAssignLaterSelected, setIsAssignLaterSelected] =
		React.useState(false);
	const [badgeReceivers, setBadgeReceivers] =
		React.useState<TournamentBadgeReceivers>([]);

	const bracketUrl = location.pathname?.replace(/\/finalize$/, "");

	const tournamentHasBadges = data.badges.length > 0;

	const badgesError = !isAssignLaterSelected
		? validateBadgeReceivers({ badgeReceivers, badges: data.badges })
		: null;

	return (
		<SendouDialog
			isOpen
			onCloseTo={bracketUrl}
			heading={t("tournament:actions.finalize")}
		>
			<FinalizeForm
				error={badgesError}
				isAssigningBadges={!isAssignLaterSelected && tournamentHasBadges}
			>
				{tournamentHasBadges ? (
					<>
						<SendouSwitch
							isSelected={isAssignLaterSelected}
							onChange={setIsAssignLaterSelected}
							data-testid="assign-badges-later-switch"
						>
							{t("tournament:actions.finalize.assignBadgesLater")}
						</SendouSwitch>
						{!isAssignLaterSelected ? (
							<>
								<input
									type="hidden"
									name="badgeReceivers"
									value={JSON.stringify(badgeReceivers)}
								/>
								<NewBadgeReceiversSelector
									badges={data.badges}
									standings={data.standings}
									badgeReceivers={badgeReceivers}
									setBadgeReceivers={setBadgeReceivers}
								/>
							</>
						) : null}
					</>
				) : null}
			</FinalizeForm>
		</SendouDialog>
	);
}

function FinalizeForm({
	children,
	error,
	isAssigningBadges,
}: {
	children: React.ReactNode;
	error: ReturnType<typeof validateBadgeReceivers>;
	isAssigningBadges: boolean;
}) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["tournament"]);

	return (
		<fetcher.Form method="post" className="stack md">
			<input type="hidden" name="_action" value="FINALIZE_TOURNAMENT" />
			<div className="stack md">{children}</div>
			<div className="stack horizontal md justify-center mt-2">
				<SubmitButton testId="confirm-button" isDisabled={Boolean(error)}>
					{t(
						isAssigningBadges
							? "tournament:actions.finalize.action.withBadges"
							: "tournament:actions.finalize.action",
					)}
				</SubmitButton>
			</div>
			{error ? (
				<FormMessage type="error" className="text-center">
					{t(`tournament:actions.finalize.error.${error}`)}
				</FormMessage>
			) : (
				<FormMessage type="info" className="text-center">
					{t("tournament:actions.finalize.info")}
				</FormMessage>
			)}
		</fetcher.Form>
	);
}

function NewBadgeReceiversSelector({
	badges,
	standings,
	badgeReceivers,
	setBadgeReceivers,
}: {
	badges: FinalizeTournamentLoaderData["badges"];
	standings: FinalizeTournamentLoaderData["standings"];
	badgeReceivers: TournamentBadgeReceivers;
	setBadgeReceivers: (owners: TournamentBadgeReceivers) => void;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const id = React.useId();

	const handleTeamSelected =
		(badgeId: number) => (e: React.ChangeEvent<HTMLSelectElement>) => {
			const newReceivers = badgeReceivers.filter(
				(receiver) => receiver.badgeId !== badgeId,
			);

			if (e.target.value !== "") {
				const newOwnerTournamentTeamId = Number(e.target.value);
				const newOwnerStanding = standings.find(
					(standing) => standing.tournamentTeamId === newOwnerTournamentTeamId,
				);
				invariant(newOwnerStanding);

				const defaultSelected =
					tournament.minMembersPerTeam === newOwnerStanding.members.length;

				newReceivers.push({
					badgeId: badgeId,
					tournamentTeamId: newOwnerTournamentTeamId,
					userIds: defaultSelected
						? newOwnerStanding.members.map((m) => m.userId)
						: [],
				});
			}

			setBadgeReceivers(newReceivers);
		};

	const handleReceiverSelected =
		({ badgeId, userId }: { badgeId: number; userId: number }) =>
		(isSelected: boolean) => {
			const newReceivers = badgeReceivers.map((receiver) => {
				if (receiver.badgeId !== badgeId) return receiver;

				const newUserIds = isSelected
					? [...receiver.userIds, userId]
					: receiver.userIds.filter((id) => id !== userId);

				return {
					...receiver,
					userIds: newUserIds,
				};
			});

			setBadgeReceivers(newReceivers);
		};

	return (
		<div className="stack lg">
			{badges.map((badge) => {
				const receiver = badgeReceivers.find(
					(owner) => owner.badgeId === badge.id,
				);
				const standingToReceive = standings.find(
					(standing) =>
						standing.tournamentTeamId === receiver?.tournamentTeamId,
				);

				return (
					<div key={badge.id} className="stack md">
						<h2 className="stack sm horizontal items-center text-sm">
							<div className="finalize__badge-container">
								<Badge badge={badge} size={32} isAnimated />
							</div>{" "}
							{badge.displayName}
						</h2>
						<div>
							<label htmlFor={`${id}-${badge.id}`}>
								{t("tournament:finalize.receivingTeam.label")}
							</label>
							<select
								id={`${id}-${badge.id}`}
								value={receiver?.tournamentTeamId ?? ""}
								onChange={handleTeamSelected(badge.id)}
							>
								<option value="">
									{t("tournament:finalize.receivingTeam.placeholder")}
								</option>
								{standings.map((standing) => (
									<option key={standing.name} value={standing.tournamentTeamId}>
										<Placement placement={standing.placement} plain />){" "}
										{standing.name}
									</option>
								))}
							</select>
						</div>
						{standingToReceive?.members.map((member, i) => {
							return (
								<div key={member.userId} className="stack sm">
									<div className="stack horizontal items-center">
										<SendouSwitch
											isSelected={receiver?.userIds.includes(member.userId)}
											onChange={handleReceiverSelected({
												badgeId: badge.id,
												userId: member.userId,
											})}
											size="small"
										/>
										<Avatar user={member} size="xxs" className="mr-2" />
										{member.username}
									</div>
									<div className="stack horizontal sm items-end">
										<ParticipationPill setResults={member.setResults} />
									</div>
									{i !== standingToReceive?.members.length - 1 && (
										<Divider className="mt-3" />
									)}
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}
