import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { WeaponImage } from "~/components/Image";
import { WeaponPool } from "~/components/match-page/WeaponPool";
import { useUser } from "~/features/auth/core/user";
import * as IngestedNames from "~/features/ingest/core/IngestedNames";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import styles from "./TournamentMatchIngestedUsers.module.css";

// xxx: do we really need linking ingested users yet?
// xxx: clear buttons overlap

export function TournamentMatchIngestedUsers({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();
	const tournament = useTournament();

	const unlinkedGroups = IngestedNames.unlinkedNameGroups(
		data.ingestedWeapons.filter((weapon) => weapon.userId === null),
	);

	const canLink =
		data.match.players.some((p) => p.id === user?.id) ||
		tournament.isOrganizer(user);

	if (unlinkedGroups.length === 0 || !canLink) return null;

	return (
		<div className="stack items-center mt-4">
			<SendouDialog
				heading={t("tournament:match.ingest.title")}
				trigger={
					<SendouButton variant="outlined" size="small">
						{t("tournament:match.ingest.showDialogButton")}
					</SendouButton>
				}
			>
				<IngestedUsersForm data={data} unlinkedGroups={unlinkedGroups} />
			</SendouDialog>
		</div>
	);
}

function IngestedUsersForm({
	data,
	unlinkedGroups,
}: {
	data: TournamentMatchLoaderData;
	unlinkedGroups: IngestedNames.IngestedNameGroup[];
}) {
	const { t } = useTranslation(["common", "tournament"]);
	const tournament = useTournament();
	const fetcher = useFetcher();
	const playersInSet = resolvePlayersWhoPlayedInSet(data);
	const linkedMapIndexesByUser = resolveLinkedMapIndexesByUser(data);
	const isLinkableTo = (
		group: IngestedNames.IngestedNameGroup,
		userId: number,
	) =>
		!group.mapIndexes.some((mapIndex) =>
			linkedMapIndexesByUser.get(userId)?.has(mapIndex),
		);
	const [selectedUserByGroup, setSelectedUserByGroup] = useState<
		Record<string, number>
	>(() => {
		const preselected = IngestedNames.preselectedUserIdByGroup({
			groups: unlinkedGroups,
			players: playersInSet,
		});
		for (const group of unlinkedGroups) {
			const key = IngestedNames.groupKey(group);
			const userId = preselected[key];
			if (userId && !isLinkableTo(group, userId)) {
				delete preselected[key];
			}
		}
		return preselected;
	});

	const teamIds = [
		...new Set(unlinkedGroups.map((group) => group.ingestedTeamId)),
	].sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0));

	const links = unlinkedGroups.flatMap((group) => {
		const userId = selectedUserByGroup[IngestedNames.groupKey(group)];
		if (!userId) return [];

		return group.names.map((ingestedInGameName) => ({
			ingestedInGameName,
			ingestedTeamId: group.ingestedTeamId,
			userId,
		}));
	});

	const handleSave = () => {
		fetcher.submit(
			{ _action: "LINK_INGESTED_USERS", links },
			{ method: "post", encType: "application/json" },
		);
	};

	return (
		<div className="stack md">
			<div className="text-lighter text-sm">
				{t("tournament:match.ingest.explanation")}
			</div>
			{teamIds.map((teamId) => {
				const members = playersInSet.filter(
					(p) => teamId === null || p.tournamentTeamId === teamId,
				);

				return (
					<section key={teamId ?? "unknown"} className="stack sm">
						<h3 className={styles.teamName}>
							{teamId !== null
								? (tournament.teamById(teamId)?.name ?? "?")
								: t("tournament:match.ingest.unknownTeam")}
						</h3>
						<div className="stack xs">
							{members.map((member) => (
								<div key={member.id} className={styles.memberRow}>
									<Avatar user={member} size="xxs" />
									<span className={styles.memberName}>{member.username}</span>
									{member.inGameName ? (
										<span className={styles.memberInGameName}>
											{member.inGameName}
										</span>
									) : null}
									<MemberWeaponPool
										weaponPools={data.ingestedWeaponPools}
										userId={member.id}
									/>
								</div>
							))}
						</div>
						{unlinkedGroups
							.filter((group) => group.ingestedTeamId === teamId)
							.map((group) => (
								<div
									key={IngestedNames.groupKey(group)}
									className={styles.ingestedRow}
								>
									<div className={styles.ingestedInfo}>
										<div
											className={styles.ingestedName}
											title={
												group.names.length > 1
													? group.names.join(", ")
													: undefined
											}
										>
											{group.primaryName}
											{group.names.length > 1 ? (
												<span className={styles.variantCount}>
													+{group.names.length - 1}
												</span>
											) : null}
										</div>
										<div className={styles.ingestedWeapons}>
											{group.weapons.map((weaponSplId) => (
												<WeaponImage
													key={weaponSplId}
													weaponSplId={weaponSplId}
													variant="badge"
													size={24}
												/>
											))}
										</div>
									</div>
									<SendouSelect
										aria-label={t("tournament:match.ingest.selectUser")}
										placeholder={t("tournament:match.ingest.selectUser")}
										selectedKey={
											selectedUserByGroup[IngestedNames.groupKey(group)] ?? null
										}
										onSelectionChange={(key) =>
											setSelectedUserByGroup((prev) => {
												const next = { ...prev };
												if (key === null) {
													delete next[IngestedNames.groupKey(group)];
												} else {
													next[IngestedNames.groupKey(group)] = Number(key);
												}
												return next;
											})
										}
										clearable
									>
										{members
											.filter((member) => isLinkableTo(group, member.id))
											.map((member) => (
												<SendouSelectItem
													key={member.id}
													id={member.id}
													textValue={member.username}
												>
													{member.username}
													{member.inGameName ? ` (${member.inGameName})` : ""}
												</SendouSelectItem>
											))}
									</SendouSelect>
								</div>
							))}
					</section>
				);
			})}
			<div className="stack items-center">
				<SendouButton
					onPress={handleSave}
					isDisabled={links.length === 0 || fetcher.state !== "idle"}
				>
					{t("common:actions.save")}
				</SendouButton>
			</div>
		</div>
	);
}

function MemberWeaponPool({
	weaponPools,
	userId,
}: {
	weaponPools: TournamentMatchLoaderData["ingestedWeaponPools"];
	userId: number;
}) {
	const weapons = weaponPools
		.filter((entry) => entry.userId === userId)
		.map((entry) => entry.weaponSplId);

	if (weapons.length === 0) return null;

	return <WeaponPool weapons={weapons} size={20} />;
}

function resolveLinkedMapIndexesByUser(data: TournamentMatchLoaderData) {
	const result = new Map<number, Set<number>>();

	for (const weapon of data.ingestedWeapons) {
		if (weapon.userId === null) continue;

		const mapIndexes = result.get(weapon.userId) ?? new Set();
		mapIndexes.add(weapon.mapIndex);
		result.set(weapon.userId, mapIndexes);
	}

	return result;
}

function resolvePlayersWhoPlayedInSet(data: TournamentMatchLoaderData) {
	const participantUserIds = new Set(
		data.results.flatMap((result) =>
			result.participants.map((participant) => participant.userId),
		),
	);
	if (participantUserIds.size === 0) return data.match.players;

	return data.match.players.filter((player) =>
		participantUserIds.has(player.id),
	);
}
