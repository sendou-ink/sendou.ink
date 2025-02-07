import cachified from "@epic-web/cachified";
import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import type { FetcherWithComponents } from "@remix-run/react";
import {
	Link,
	useFetcher,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { NewTabs } from "~/components/NewTabs";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { ArchiveBoxIcon } from "~/components/icons/ArchiveBox";
import { CrossIcon } from "~/components/icons/Cross";
import { DiscordIcon } from "~/components/icons/Discord";
import { RefreshArrowsIcon } from "~/components/icons/RefreshArrows";
import { ScaleIcon } from "~/components/icons/Scale";
import { sql } from "~/db/sql";
import type { GroupMember, ReportedWeapon } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import { getUserId, requireUser } from "~/features/auth/core/user.server";
import * as NotificationService from "~/features/chat/NotificationService.server";
import type { ChatMessage } from "~/features/chat/chat-types";
import { Chat, type ChatProps, useChat } from "~/features/chat/components/Chat";
import { currentOrPreviousSeason, currentSeason } from "~/features/mmr/season";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import { AddPrivateNoteDialog } from "~/features/sendouq-match/components/AddPrivateNoteDialog";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { resolveRoomPass } from "~/features/tournament-bracket/tournament-bracket-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useWindowSize } from "~/hooks/useWindowSize";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { SPLATTERCOLOR_SCREEN_ID } from "~/modules/in-game-lists/weapon-ids";
import { isMod } from "~/permissions";
import { joinListToNaturalString } from "~/utils/arrays";
import { cache } from "~/utils/cache.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { animate } from "~/utils/flip";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { safeNumberParse } from "~/utils/number";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import type { Unpacked } from "~/utils/types";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOUQ_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_RULES_PAGE,
	SENDOU_INK_DISCORD_URL,
	navIconUrl,
	preferenceEmojiUrl,
	sendouQMatchPage,
	specialWeaponImageUrl,
	teamPage,
	userSubmittedImage,
} from "~/utils/urls";
import { GroupCard } from "../components/GroupCard";
import { matchEndedAtIndex } from "../core/match";
import { compareMatchToReportedScores } from "../core/match.server";
import type { ReportedWeaponForMerging } from "../core/reported-weapons.server";
import {
	mergeReportedWeapons,
	reportedWeaponsToArrayOfArrays,
} from "../core/reported-weapons.server";
import { calculateMatchSkills } from "../core/skills.server";
import {
	summarizeMaps,
	summarizePlayerResults,
} from "../core/summarizer.server";
import { FULL_GROUP_SIZE } from "../q-constants";
import { useRecentlyReportedWeapons } from "../q-hooks";
import { matchSchema, qMatchPageParamsSchema } from "../q-schemas.server";
import { winnersArrayToWinner } from "../q-utils";
import { addDummySkill } from "../queries/addDummySkill.server";
import { addMapResults } from "../queries/addMapResults.server";
import { addPlayerResults } from "../queries/addPlayerResults.server";
import { addReportedWeapons } from "../queries/addReportedWeapons.server";
import { addSkills } from "../queries/addSkills.server";
import { deleteReporterWeaponsByMatchId } from "../queries/deleteReportedWeaponsByMatchId.server";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findMatchById } from "../queries/findMatchById.server";
import { reportScore } from "../queries/reportScore.server";
import { reportedWeaponsByMatchId } from "../queries/reportedWeaponsByMatchId.server";
import { setGroupAsInactive } from "../queries/setGroupAsInactive.server";
import "../q.css";
import { SendouSwitch } from "~/components/elements/Switch";
import { metaTags } from "~/utils/remix";

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return metaTags({
		title: `SendouQ - Match #${data.match.id}`,
		description: `${joinListToNaturalString(
			data.groupAlpha.members.map((m) => m.username),
		)} vs. ${joinListToNaturalString(
			data.groupBravo.members.map((m) => m.username),
		)}`,
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["q", "tournament", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("sendouq"),
		href: SENDOUQ_PAGE,
		type: "IMAGE",
	}),
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: matchSchema,
	});

	switch (data._action) {
		case "REPORT_SCORE": {
			const reportWeapons = () => {
				const oldReportedWeapons = reportedWeaponsByMatchId(matchId) ?? [];

				const mergedWeapons = mergeReportedWeapons({
					oldWeapons: oldReportedWeapons,
					newWeapons: data.weapons as (ReportedWeapon & {
						mapIndex: number;
						groupMatchMapId: number;
					})[],
					newReportedMapsCount: data.winners.length,
				});

				sql.transaction(() => {
					deleteReporterWeaponsByMatchId(matchId);
					addReportedWeapons(mergedWeapons);
				})();
			};

			const match = notFoundIfFalsy(findMatchById(matchId));
			if (match.isLocked) {
				reportWeapons();
				return null;
			}

			validate(
				!data.adminReport || isMod(user),
				"Only mods can report scores as admin",
			);
			const members = [
				...(await QMatchRepository.findGroupById({
					groupId: match.alphaGroupId,
				}))!.members.map((m) => ({
					...m,
					groupId: match.alphaGroupId,
				})),
				...(await QMatchRepository.findGroupById({
					groupId: match.bravoGroupId,
				}))!.members.map((m) => ({
					...m,
					groupId: match.bravoGroupId,
				})),
			];

			const groupMemberOfId = members.find((m) => m.id === user.id)?.groupId;
			invariant(
				groupMemberOfId || data.adminReport,
				"User is not a member of any group",
			);

			const winner = winnersArrayToWinner(data.winners);
			const winnerGroupId =
				winner === "ALPHA" ? match.alphaGroupId : match.bravoGroupId;
			const loserGroupId =
				winner === "ALPHA" ? match.bravoGroupId : match.alphaGroupId;

			// when admin reports match gets locked right away
			const compared = data.adminReport
				? "SAME"
				: compareMatchToReportedScores({
						match,
						winners: data.winners,
						newReporterGroupId: groupMemberOfId!,
						previousReporterGroupId: match.reportedByUserId
							? members.find((m) => m.id === match.reportedByUserId)!.groupId
							: undefined,
					});

			// same group reporting same score, probably by mistake
			if (compared === "DUPLICATE") {
				reportWeapons();
				return null;
			}

			const matchIsBeingCanceled = data.winners.length === 0;

			const { newSkills, differences } =
				compared === "SAME" && !matchIsBeingCanceled
					? calculateMatchSkills({
							groupMatchId: match.id,
							winner: (await QMatchRepository.findGroupById({
								groupId: winnerGroupId,
							}))!.members.map((m) => m.id),
							loser: (await QMatchRepository.findGroupById({
								groupId: loserGroupId,
							}))!.members.map((m) => m.id),
							winnerGroupId,
							loserGroupId,
						})
					: { newSkills: null, differences: null };

			const shouldLockMatchWithoutChangingRecords =
				compared === "SAME" && matchIsBeingCanceled;

			let clearCaches = false;
			sql.transaction(() => {
				if (
					compared === "FIX_PREVIOUS" ||
					compared === "FIRST_REPORT" ||
					data.adminReport
				) {
					reportScore({
						matchId,
						reportedByUserId: user.id,
						winners: data.winners,
					});
				}
				// own group gets set inactive
				if (groupMemberOfId) setGroupAsInactive(groupMemberOfId);
				// skills & map/player results only update after both teams have reported
				if (newSkills) {
					addMapResults(
						summarizeMaps({ match, members, winners: data.winners }),
					);
					addPlayerResults(
						summarizePlayerResults({ match, members, winners: data.winners }),
					);
					addSkills({
						skills: newSkills,
						differences,
						groupMatchId: match.id,
						oldMatchMemento: match.memento,
					});
					clearCaches = true;
				}
				if (shouldLockMatchWithoutChangingRecords) {
					addDummySkill(match.id);
					clearCaches = true;
				}
				// fix edge case where they 1) report score 2) report weapons 3) report score again, but with different amount of maps played
				if (compared === "FIX_PREVIOUS") {
					deleteReporterWeaponsByMatchId(matchId);
				}
				// admin reporting, just set both groups inactive
				if (data.adminReport) {
					setGroupAsInactive(match.alphaGroupId);
					setGroupAsInactive(match.bravoGroupId);
				}
			})();

			if (clearCaches) {
				// this is kind of useless to do when admin reports since skills don't change
				// but it's not the most common case so it's ok
				try {
					refreshUserSkills(currentOrPreviousSeason(new Date())!.nth);
				} catch (error) {
					logger.warn("Error refreshing user skills", error);
				}

				refreshStreamsCache();
			}

			if (compared === "DIFFERENT") {
				return {
					error: matchIsBeingCanceled
						? ("cant-cancel" as const)
						: ("different" as const),
				};
			}

			// in a different transaction but it's okay
			reportWeapons();

			if (match.chatCode) {
				const type = (): NonNullable<ChatMessage["type"]> => {
					if (compared === "SAME") {
						return matchIsBeingCanceled
							? "CANCEL_CONFIRMED"
							: "SCORE_CONFIRMED";
					}

					return matchIsBeingCanceled ? "CANCEL_REPORTED" : "SCORE_REPORTED";
				};

				NotificationService.notify({
					room: match.chatCode,
					type: type(),
					context: {
						name: user.username,
					},
				});
			}

			break;
		}
		case "LOOK_AGAIN": {
			const season = currentSeason(new Date());
			validate(season, "Season is not active");

			const previousGroup = await QMatchRepository.findGroupById({
				groupId: data.previousGroupId,
			});
			validate(previousGroup, "Previous group not found");

			for (const member of previousGroup.members) {
				const currentGroup = findCurrentGroupByUserId(member.id);
				validate(!currentGroup, "Member is already in a group");
				if (member.id === user.id) {
					validate(
						member.role === "OWNER",
						"You are not the owner of the group",
					);
				}
			}

			await QRepository.createGroupFromPrevious({
				previousGroupId: data.previousGroupId,
				members: previousGroup.members.map((m) => ({ id: m.id, role: m.role })),
			});

			throw redirect(SENDOUQ_PREPARING_PAGE);
		}
		case "REPORT_WEAPONS": {
			const match = notFoundIfFalsy(findMatchById(matchId));
			validate(match.reportedAt, "Match has not been reported yet");

			const oldReportedWeapons = reportedWeaponsByMatchId(matchId) ?? [];

			const mergedWeapons = mergeReportedWeapons({
				oldWeapons: oldReportedWeapons,
				newWeapons: data.weapons as (ReportedWeapon & {
					mapIndex: number;
					groupMatchMapId: number;
				})[],
			});

			sql.transaction(() => {
				deleteReporterWeaponsByMatchId(matchId);
				addReportedWeapons(mergedWeapons);
			})();

			break;
		}
		case "ADD_PRIVATE_USER_NOTE": {
			await QRepository.upsertPrivateUserNote({
				authorId: user.id,
				sentiment: data.sentiment,
				targetId: data.targetId,
				text: data.comment,
			});

			throw redirect(sendouQMatchPage(matchId));
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const match = notFoundIfFalsy(await QMatchRepository.findById(matchId));

	const [groupAlpha, groupBravo] = await Promise.all([
		QMatchRepository.findGroupById({
			groupId: match.alphaGroupId,
			loggedInUserId: user?.id,
		}),
		QMatchRepository.findGroupById({
			groupId: match.bravoGroupId,
			loggedInUserId: user?.id,
		}),
	]);
	invariant(groupAlpha, "Group alpha not found");
	invariant(groupBravo, "Group bravo not found");

	const isTeamAlphaMember = groupAlpha.members.some((m) => m.id === user?.id);
	const isTeamBravoMember = groupBravo.members.some((m) => m.id === user?.id);
	const isMatchInsider = isTeamAlphaMember || isTeamBravoMember || isMod(user);
	const matchHappenedInTheLastMonth =
		databaseTimestampToDate(match.createdAt).getTime() >
		Date.now() - 30 * 24 * 3600 * 1000;

	const censoredGroupAlpha = {
		...groupAlpha,
		chatCode: undefined,
		members: groupAlpha.members.map((m) => ({
			...m,
			friendCode:
				isMatchInsider && matchHappenedInTheLastMonth
					? m.friendCode
					: undefined,
		})),
	};
	const censoredGroupBravo = {
		...groupBravo,
		chatCode: undefined,
		members: groupBravo.members.map((m) => ({
			...m,
			friendCode:
				isMatchInsider && matchHappenedInTheLastMonth
					? m.friendCode
					: undefined,
		})),
	};
	const censoredMatch = { ...match, chatCode: undefined };

	const groupChatCode = () => {
		if (isTeamAlphaMember) return groupAlpha.chatCode;
		if (isTeamBravoMember) return groupBravo.chatCode;

		return null;
	};

	const rawReportedWeapons = match.reportedAt
		? reportedWeaponsByMatchId(matchId)
		: null;

	const banScreen = !match.isLocked
		? await cachified({
				key: `matches-screen-ban-${match.id}`,
				cache,
				async getFreshValue() {
					const noScreenSettings =
						await QMatchRepository.groupMembersNoScreenSettings([
							groupAlpha,
							groupBravo,
						]);

					return noScreenSettings.some((user) => user.noScreen);
				},
			})
		: null;

	return {
		match: censoredMatch,
		matchChatCode: isMatchInsider ? match.chatCode : null,
		canPostChatMessages: isTeamAlphaMember || isTeamBravoMember,
		groupChatCode: groupChatCode(),
		groupAlpha: censoredGroupAlpha,
		groupBravo: censoredGroupBravo,
		banScreen,
		groupMemberOf: isTeamAlphaMember
			? ("ALPHA" as const)
			: isTeamBravoMember
				? ("BRAVO" as const)
				: null,
		reportedWeapons: match.reportedAt
			? reportedWeaponsToArrayOfArrays({
					groupAlpha,
					groupBravo,
					mapList: match.mapList,
					reportedWeapons: rawReportedWeapons,
				})
			: null,
		rawReportedWeapons,
	};
};

export default function QMatchPage() {
	const user = useUser();
	const isMounted = useIsMounted();
	const { t, i18n } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const [showWeaponsForm, setShowWeaponsForm] = React.useState(false);
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	React.useEffect(() => {
		setShowWeaponsForm(false);
	}, [data.reportedWeapons, data.match.id]);

	const ownMember =
		data.groupAlpha.members.find((m) => m.id === user?.id) ??
		data.groupBravo.members.find((m) => m.id === user?.id);
	const canReportScore = Boolean(
		!data.match.isLocked && (ownMember || isMod(user)),
	);

	const ownGroup = data.groupAlpha.members.some((m) => m.id === user?.id)
		? data.groupAlpha
		: data.groupBravo.members.some((m) => m.id === user?.id)
			? data.groupBravo
			: null;

	const ownTeamReported = Boolean(
		data.match.reportedByUserId &&
			ownGroup?.members.some((m) => m.id === data.match.reportedByUserId),
	);
	const showScore =
		data.match.isLocked || (data.match.reportedByUserId && ownGroup);

	const addingNoteFor = (
		data.groupMemberOf === "ALPHA" ? data.groupAlpha : data.groupBravo
	).members.find((m) => m.id === safeNumberParse(searchParams.get("note")));

	return (
		<Main className="q-match__container stack xl">
			<AddPrivateNoteDialog
				aboutUser={addingNoteFor}
				close={() => navigate(sendouQMatchPage(data.match.id))}
			/>
			<div className="q-match__header">
				<h2>{t("q:match.header", { number: data.match.id })}</h2>
				<div
					className={clsx("text-xs text-lighter", {
						invisible: !isMounted,
					})}
				>
					{isMounted
						? databaseTimestampToDate(data.match.createdAt).toLocaleString(
								i18n.language,
								{
									day: "numeric",
									month: "numeric",
									year: "numeric",
									hour: "numeric",
									minute: "numeric",
								},
							)
						: // reserve place
							"0/0/0 0:00"}
				</div>
			</div>
			{showScore ? (
				<>
					<Score
						reportedAt={data.match.reportedAt!}
						ownTeamReported={ownTeamReported}
					/>
					{ownGroup && ownMember && data.match.reportedAt ? (
						<AfterMatchActions
							ownGroupId={ownGroup.id}
							role={ownMember.role}
							reportedAt={data.match.reportedAt}
							showWeaponsForm={showWeaponsForm}
							setShowWeaponsForm={setShowWeaponsForm}
							key={data.reportedWeapons?.join("")}
						/>
					) : null}
				</>
			) : null}
			{!showWeaponsForm ? (
				<>
					<div className="q-match__teams-container">
						{[data.groupAlpha, data.groupBravo].map((group, i) => {
							const side = i === 0 ? "ALPHA" : "BRAVO";
							const isOwnGroup = data.groupMemberOf === side;

							const matchHasBeenReported = Boolean(data.match.reportedByUserId);
							const showAddNote =
								data.groupMemberOf === side && matchHasBeenReported;

							return (
								<div className="stack sm text-lighter text-xs" key={group.id}>
									<div className="stack horizontal justify-between items-center">
										{i === 0 ? "Alpha" : "Bravo"}
										{group.team ? (
											<Link
												to={teamPage(group.team.customUrl)}
												className="stack horizontal items-center xs font-bold"
											>
												{group.team.avatarUrl ? (
													<Avatar
														url={userSubmittedImage(group.team.avatarUrl)}
														size="xxs"
													/>
												) : null}
												{group.team.name}
											</Link>
										) : null}
									</div>
									<GroupCard
										group={group}
										displayOnly
										hideVc={matchHasBeenReported || !isOwnGroup}
										hideWeapons={matchHasBeenReported}
										showAddNote={showAddNote}
									/>
								</div>
							);
						})}
					</div>
					<BottomSection
						canReportScore={canReportScore}
						ownTeamReported={ownTeamReported}
						participatingInTheMatch={Boolean(ownMember)}
					/>
				</>
			) : null}
		</Main>
	);
}

function Score({
	reportedAt,
	ownTeamReported,
}: {
	reportedAt: number;
	ownTeamReported: boolean;
}) {
	const isMounted = useIsMounted();
	const { t, i18n } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const reporter =
		data.groupAlpha.members.find((m) => m.id === data.match.reportedByUserId) ??
		data.groupBravo.members.find((m) => m.id === data.match.reportedByUserId);

	const score = data.match.mapList.reduce(
		(acc, cur) => {
			if (!cur.winnerGroupId) return acc;

			if (cur.winnerGroupId === data.match.alphaGroupId) {
				return [acc[0] + 1, acc[1]];
			}

			return [acc[0], acc[1] + 1];
		},
		[0, 0],
	);

	if (score[0] === 0 && score[1] === 0) {
		return (
			<div className="stack items-center line-height-tight">
				<div className="text-sm font-bold text-warning">
					{data.match.isLocked
						? t("q:match.canceled")
						: t("q:match.cancelRequested")}
				</div>
				{!data.match.isLocked ? (
					<div className="text-xs text-lighter stack xs items-center text-center">
						{!ownTeamReported ? (
							<DisputePopover />
						) : (
							t("q:match.cancelPendingConfirmation")
						)}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div className="stack items-center line-height-tight">
			<div className="text-lg font-bold">{score.join(" - ")}</div>
			{data.match.isLocked ? (
				<div
					className={clsx("text-xs text-lighter", { invisible: !isMounted })}
				>
					{t("q:match.reportedBy", { name: reporter?.username ?? "admin" })}{" "}
					{isMounted
						? databaseTimestampToDate(reportedAt).toLocaleString(
								i18n.language,
								{
									day: "numeric",
									month: "numeric",
									year: "numeric",
									hour: "numeric",
									minute: "numeric",
								},
							)
						: ""}
				</div>
			) : (
				<div className="text-xs text-lighter stack xs items-center text-center">
					{t("q:match.spInfo")} {!ownTeamReported ? <DisputePopover /> : null}
				</div>
			)}
		</div>
	);
}

function DisputePopover() {
	const { t } = useTranslation(["q"]);

	return (
		<SendouPopover
			popoverClassName="text-main-forced"
			trigger={
				<SendouButton
					size="small"
					variant="minimal-destructive"
					className="mt-2"
				>
					{t("q:match.dispute.button")}
				</SendouButton>
			}
		>
			<p>{t("q:match.dispute.p1")}</p>
			<p className="mt-2">{t("q:match.dispute.p2")}</p>
		</SendouPopover>
	);
}

function AfterMatchActions({
	ownGroupId,
	role,
	reportedAt,
	showWeaponsForm,
	setShowWeaponsForm,
}: {
	ownGroupId: number;
	role: GroupMember["role"];
	reportedAt: number;
	showWeaponsForm: boolean;
	setShowWeaponsForm: (show: boolean) => void;
}) {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const lookAgainFetcher = useFetcher();

	const wasReportedInTheLastHour =
		databaseTimestampToDate(reportedAt).getTime() > Date.now() - 3600 * 1000;

	const season = currentSeason(new Date());
	const showLookAgain = role === "OWNER" && wasReportedInTheLastHour && season;

	const wasReportedInTheLastWeek =
		databaseTimestampToDate(reportedAt).getTime() >
		Date.now() - 7 * 24 * 3600 * 1000;
	const showWeaponsFormButton =
		wasReportedInTheLastWeek && data.match.mapList[0].winnerGroupId;

	return (
		<div className="stack lg">
			<lookAgainFetcher.Form
				method="post"
				className="stack horizontal justify-center md flex-wrap"
			>
				<input type="hidden" name="previousGroupId" value={ownGroupId} />
				{showLookAgain ? (
					<SubmitButton
						icon={<RefreshArrowsIcon />}
						state={lookAgainFetcher.state}
						_action="LOOK_AGAIN"
					>
						{t("q:match.actions.lookAgain")}
					</SubmitButton>
				) : null}
				{showWeaponsFormButton ? (
					<Button
						icon={<ArchiveBoxIcon />}
						onClick={() => setShowWeaponsForm(!showWeaponsForm)}
						variant={showWeaponsForm ? "destructive" : undefined}
					>
						{showWeaponsForm
							? t("q:match.actions.stopReportingWeapons")
							: t("q:match.actions.reportWeapons")}
					</Button>
				) : null}
			</lookAgainFetcher.Form>
			{showWeaponsForm ? <ReportWeaponsForm /> : null}
		</div>
	);
}

function ReportWeaponsForm() {
	const { t } = useTranslation(["q", "user"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const weaponsFetcher = useFetcher();

	const [weaponsUsage, setWeaponsUsage] = React.useState<
		ReportedWeaponForMerging[]
	>(data.rawReportedWeapons ?? []);
	const [reportingMode, setReportingMode] = React.useState<
		"ALL" | "MYSELF" | "MY_TEAM"
	>("MYSELF");
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const playedMaps = data.match.mapList.filter((m) => m.winnerGroupId);
	const winners = playedMaps.map((m) =>
		m.winnerGroupId === data.match.alphaGroupId ? "ALPHA" : "BRAVO",
	);

	const handleCopyWeaponsFromPreviousMap =
		({
			mapIndex,
			groupMatchMapId,
		}: {
			mapIndex: number;
			groupMatchMapId: number;
		}) =>
		() => {
			setWeaponsUsage((val) => {
				const previousWeapons = val.filter(
					(reportedWeapon) => reportedWeapon.mapIndex === mapIndex - 1,
				);

				return [
					...val.filter(
						(reportedWeapon) => reportedWeapon.mapIndex !== mapIndex,
					),
					...previousWeapons.map((reportedWeapon) => ({
						...reportedWeapon,
						mapIndex,
						groupMatchMapId,
					})),
				];
			});
		};

	const playersToReport = () => {
		const allPlayers = [...data.groupAlpha.members, ...data.groupBravo.members];

		switch (reportingMode) {
			case "ALL": {
				return allPlayers;
			}
			case "MYSELF": {
				const me = allPlayers.find((m) => m.id === user?.id);
				invariant(me, "User not found");

				return [me];
			}
			case "MY_TEAM": {
				return data.groupMemberOf === "ALPHA"
					? data.groupAlpha.members
					: data.groupBravo.members;
			}
			default:
				assertUnreachable(reportingMode);
		}
	};

	return (
		<weaponsFetcher.Form method="post" className="stack lg">
			<input
				type="hidden"
				name="weapons"
				value={JSON.stringify(weaponsUsage)}
			/>
			<div className="stack horizontal sm justify-between w-max mx-auto">
				<h3 className="text-md">{t("q:match.report.whoToReport")}</h3>
				<label className="stack horizontal xs items-center mb-0">
					{t("q:match.report.whoToReport.me")}
					<input
						type="radio"
						checked={reportingMode === "MYSELF"}
						onChange={() => setReportingMode("MYSELF")}
					/>
				</label>
				<label className="stack horizontal xs items-center mb-0">
					{t("q:match.report.whoToReport.myTeam")}
					<input
						type="radio"
						checked={reportingMode === "MY_TEAM"}
						onChange={() => setReportingMode("MY_TEAM")}
					/>
				</label>
				<label className="stack horizontal xs items-center mb-0">
					{t("q:match.report.whoToReport.everyone")}
					<input
						type="radio"
						checked={reportingMode === "ALL"}
						onChange={() => setReportingMode("ALL")}
					/>
				</label>
			</div>
			<div className="stack md mx-auto">
				{playedMaps.map((map, i) => {
					const groupMatchMapId = map.id;

					return (
						<div key={map.stageId} className="stack md">
							<MapListMap
								canReportScore={false}
								i={i}
								map={map}
								winners={winners}
								showReportedOwnWeapon={false}
							/>
							{i !== 0 && reportingMode !== "MYSELF" ? (
								<Button
									size="tiny"
									variant="outlined"
									className="self-center"
									onClick={handleCopyWeaponsFromPreviousMap({
										groupMatchMapId,
										mapIndex: i,
									})}
								>
									{t("q:match.report.copyWeapons")}
								</Button>
							) : null}
							<div className="stack sm">
								{playersToReport().map((member, j) => {
									const weaponSplId =
										weaponsUsage.find(
											(w) =>
												w.groupMatchMapId === groupMatchMapId &&
												w.userId === member.id,
										)?.weaponSplId ?? null;

									return (
										<React.Fragment key={member.id}>
											{j === 0 && reportingMode === "ALL" ? (
												<Divider className="text-sm">
													{t("q:match.sides.alpha")}
												</Divider>
											) : null}
											{j === FULL_GROUP_SIZE && reportingMode === "ALL" ? (
												<Divider className="text-sm">
													{t("q:match.sides.bravo")}
												</Divider>
											) : null}
											<div
												key={member.id}
												className="stack horizontal sm justify-between items-center flex-wrap"
											>
												<div className="q-match__report__user-name-container">
													<Avatar user={member} size="xxs" />{" "}
													{member.inGameName ? (
														<>
															<span className="text-lighter font-semi-bold">
																{t("user:ign.short")}:
															</span>{" "}
															{inGameNameWithoutDiscriminator(
																member.inGameName,
															)}
														</>
													) : (
														member.username
													)}
												</div>
												<div className="stack horizontal sm items-center">
													<WeaponImage
														weaponSplId={weaponSplId ?? 0}
														variant="badge"
														width={32}
														className={clsx("ml-auto", {
															invisible: typeof weaponSplId !== "number",
														})}
													/>
													<WeaponCombobox
														inputName="weapon"
														value={weaponSplId}
														quickSelectWeaponIds={recentlyReportedWeapons}
														onChange={(weapon) => {
															if (!weapon) return;

															const weaponSplId = Number(
																weapon.value,
															) as MainWeaponId;

															addRecentlyReportedWeapon(weaponSplId);

															setWeaponsUsage((val) => {
																const result = val.filter(
																	(reportedWeapon) =>
																		reportedWeapon.groupMatchMapId !==
																			groupMatchMapId ||
																		reportedWeapon.userId !== member.id,
																);

																result.push({
																	weaponSplId,
																	mapIndex: i,
																	groupMatchMapId,
																	userId: member.id,
																});

																return result;
															});
														}}
													/>
												</div>
											</div>
										</React.Fragment>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
			{weaponsUsage.flat().some((val) => val === null) ? (
				<div className="text-sm text-center text-warning font-semi-bold">
					{t("q:match.report.error")}
				</div>
			) : (
				<div className="stack items-center">
					<SubmitButton _action="REPORT_WEAPONS">
						{t("q:match.report.submit")}
					</SubmitButton>
				</div>
			)}
		</weaponsFetcher.Form>
	);
}

function BottomSection({
	canReportScore,
	ownTeamReported,
	participatingInTheMatch,
}: {
	canReportScore: boolean;
	ownTeamReported: boolean;
	participatingInTheMatch: boolean;
}) {
	const { t } = useTranslation(["q", "common"]);
	const { width } = useWindowSize();
	const isMobile = width < 750;
	const isMounted = useIsMounted();
	const [isReportingWeapons, setIsReportingWeapons] = React.useState(false);

	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const submitScoreFetcher = useFetcher<typeof action>();
	const cancelFetcher = useFetcher<typeof action>();

	const chatUsers = React.useMemo(() => {
		return Object.fromEntries(
			[...data.groupAlpha.members, ...data.groupBravo.members].map((m) => [
				m.id,
				m,
			]),
		);
	}, [data]);

	const [_unseenMessages, setUnseenMessages] = React.useState(0);
	const [chatVisible, setChatVisible] = React.useState(false);

	const onNewMessage = React.useCallback(() => {
		setUnseenMessages((msg) => msg + 1);
	}, []);

	const chatRooms = React.useMemo(() => {
		return [
			data.matchChatCode ? { code: data.matchChatCode, label: "Match" } : null,
			data.groupChatCode ? { code: data.groupChatCode, label: "Group" } : null,
		].filter(Boolean) as ChatProps["rooms"];
	}, [data.matchChatCode, data.groupChatCode]);

	const ownWeaponsReported = data.rawReportedWeapons?.some(
		(rw) => rw.userId === user?.id,
	);

	// revalidates: false when we don't want the user to lose the weapons
	// they are reporting when the match gets suddenly locked
	const chat = useChat({
		rooms: chatRooms,
		onNewMessage,
		revalidates: ownWeaponsReported || !isReportingWeapons,
	});

	const onChatMount = React.useCallback(() => {
		setChatVisible(true);
	}, []);

	const onChatUnmount = React.useCallback(() => {
		setChatVisible(false);
		setUnseenMessages(0);
	}, []);

	const unseenMessages = chatVisible ? 0 : _unseenMessages;

	const showMid =
		!data.match.isLocked && (participatingInTheMatch || isMod(user));

	const poolCode = () => {
		const stringId = String(data.match.id);
		const lastDigit = stringId[stringId.length - 1];

		return `SQ${lastDigit}`;
	};

	if (!isMounted) return null;

	const chatElement = (
		<Chat
			chat={chat}
			onMount={onChatMount}
			onUnmount={onChatUnmount}
			users={chatUsers}
			rooms={chatRooms}
			disabled={!data.canPostChatMessages}
		/>
	);

	const mapListElement = (
		<MapList
			key={data.match.id}
			canReportScore={canReportScore}
			isResubmission={ownTeamReported}
			fetcher={submitScoreFetcher}
			setIsReportingWeapons={setIsReportingWeapons}
		/>
	);

	const roomJoiningInfoElement = (
		<div
			className={clsx("q-match__pool-pass-container", { "mx-auto": !isMobile })}
		>
			<InfoWithHeader header={t("q:match.pool")} value={poolCode()} />
			<InfoWithHeader
				header={t("q:match.password.short")}
				value={resolveRoomPass(data.match.id)}
			/>
		</div>
	);

	const rulesButtonElement = (
		<LinkButton
			to={SENDOUQ_RULES_PAGE}
			variant="outlined"
			size="tiny"
			icon={<ScaleIcon />}
		>
			{t("q:front.nav.rules.title")}
		</LinkButton>
	);

	const helpdeskButtonElement = (
		<LinkButton
			isExternal
			to={SENDOU_INK_DISCORD_URL}
			variant="outlined"
			size="tiny"
			icon={<DiscordIcon />}
		>
			{t("q:match.helpdesk")}
		</LinkButton>
	);

	const cancelMatchElement =
		canReportScore && !data.match.isLocked ? (
			<FormWithConfirm
				dialogHeading={t("q:match.cancelMatch.confirm")}
				fields={[
					["_action", "REPORT_SCORE"],
					["winners", "[]"],
					...(!data.groupMemberOf ? [["adminReport", "on"] as const] : []),
				]}
				deleteButtonText={t("common:actions.cancel")}
				cancelButtonText={t("common:actions.nevermind")}
				fetcher={cancelFetcher}
			>
				<Button
					variant="minimal-destructive"
					size="tiny"
					type="submit"
					disabled={ownTeamReported && !data.match.mapList[0].winnerGroupId}
					className="build__small-text mt-4"
				>
					{t("q:match.cancelMatch")}
				</Button>
			</FormWithConfirm>
		) : null;

	const screenLegalityInfoElement =
		data.banScreen !== null ? (
			<ScreenLegalityInfo ban={data.banScreen} />
		) : null;

	const chatHidden = chatRooms.length === 0;

	if (!showMid && chatHidden) {
		return mapListElement;
	}

	if (isMobile) {
		return (
			<div className="stack lg">
				<div className="stack horizontal lg items-center justify-center">
					{roomJoiningInfoElement}
					<div className="stack md">
						{screenLegalityInfoElement}
						{rulesButtonElement}
						{helpdeskButtonElement}
						{cancelMatchElement}
					</div>
				</div>

				<div>
					<NewTabs
						sticky
						tabs={[
							{
								label: t("q:looking.columns.chat"),
								number: unseenMessages,
								hidden: chatHidden,
							},
							{
								label: t("q:match.tabs.reportScore"),
							},
						]}
						disappearing
						content={[
							{
								key: "chat",
								hidden: chatHidden,
								element: chatElement,
							},
							{
								key: "report",
								element: mapListElement,
								unmount: false,
							},
						]}
					/>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="q-match__map-list-chat-container">
				{mapListElement}
				<div
					className={clsx("q-match__bottom-mid-section", {
						invisible: !showMid,
					})}
				>
					<div className="stack md">
						{roomJoiningInfoElement}
						{rulesButtonElement}
						{helpdeskButtonElement}
						{screenLegalityInfoElement}
						{cancelMatchElement}
					</div>
				</div>
				<div className="q-match__chat-container">
					{chatRooms.length > 0 ? chatElement : null}
				</div>
			</div>
			{cancelFetcher.data?.error === "cant-cancel" ? (
				<div className="text-xs text-warning font-semi-bold text-center">
					{t("q:match.errors.cantCancel")}
				</div>
			) : null}
			{submitScoreFetcher.data?.error === "different" ? (
				<div className="text-xs text-warning font-semi-bold text-center">
					{t("q:match.errors.different")}
				</div>
			) : null}
		</>
	);
}

function ScreenLegalityInfo({ ban }: { ban: boolean }) {
	const { t } = useTranslation(["q", "weapons"]);

	return (
		<div className="q-match__screen-legality">
			<SendouPopover
				trigger={
					<SendouButton
						variant="minimal"
						size="small"
						className="q-match__screen-legality__button"
					>
						<Alert variation={ban ? "ERROR" : "SUCCESS"}>
							<div className="stack xs horizontal items-center">
								<Image
									path={specialWeaponImageUrl(SPLATTERCOLOR_SCREEN_ID)}
									width={30}
									height={30}
									alt={t(`weapons:SPECIAL_${SPLATTERCOLOR_SCREEN_ID}`)}
								/>
							</div>
						</Alert>
					</SendouButton>
				}
			>
				{ban
					? t("q:match.screen.ban", {
							special: t("weapons:SPECIAL_19"),
						})
					: t("q:match.screen.allowed", {
							special: t("weapons:SPECIAL_19"),
						})}
			</SendouPopover>
		</div>
	);
}

function InfoWithHeader({ header, value }: { header: string; value: string }) {
	return (
		<div>
			<div className="q-match__info__header">{header}</div>
			<div className="q-match__info__value">{value}</div>
		</div>
	);
}

function MapList({
	canReportScore,
	isResubmission,
	fetcher,
	setIsReportingWeapons,
}: {
	canReportScore: boolean;
	isResubmission: boolean;
	fetcher: FetcherWithComponents<any>;
	setIsReportingWeapons: (val: boolean) => void;
}) {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [adminToggleChecked, setAdminToggleChecked] = React.useState(false);
	const [ownWeaponsUsage, setOwnWeaponsUsage] = React.useState<
		ReportedWeaponForMerging[]
	>([]);
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const previouslyReportedWinners = isResubmission
		? data.match.mapList
				.filter((m) => m.winnerGroupId)
				.map((m) =>
					m.winnerGroupId === data.groupAlpha.id ? "ALPHA" : "BRAVO",
				)
		: [];
	const [winners, setWinners] = React.useState<("ALPHA" | "BRAVO")[]>(
		previouslyReportedWinners,
	);

	const newScoresAreDifferent =
		!previouslyReportedWinners ||
		previouslyReportedWinners.length !== winners.length ||
		previouslyReportedWinners.some((w, i) => w !== winners[i]);
	const scoreCanBeReported =
		Boolean(matchEndedAtIndex(winners)) &&
		!data.match.isLocked &&
		newScoresAreDifferent;
	const ownWeaponReported = data.rawReportedWeapons?.some(
		(reportedWeapon) => reportedWeapon.userId === user?.id,
	);

	return (
		<fetcher.Form method="post">
			<input type="hidden" name="winners" value={JSON.stringify(winners)} />
			<input
				type="hidden"
				name="weapons"
				value={JSON.stringify(ownWeaponsUsage)}
			/>
			<Flipper flipKey={winners.join("")}>
				<div className="stack md w-max mx-auto">
					{data.match.mapList.map((map, i) => {
						return (
							<MapListMap
								key={map.stageId}
								canReportScore={canReportScore}
								i={i}
								map={map}
								winners={winners}
								setWinners={setWinners}
								weapons={data.reportedWeapons?.[i]}
								showReportedOwnWeapon={!ownWeaponReported}
								recentlyReportedWeapons={recentlyReportedWeapons}
								addRecentlyReportedWeapon={addRecentlyReportedWeapon}
								ownWeapon={
									ownWeaponsUsage.find((w) => w.mapIndex === i)?.weaponSplId
								}
								onOwnWeaponSelected={(newReportedWeapon) => {
									if (!newReportedWeapon) return;

									setIsReportingWeapons(true);

									setOwnWeaponsUsage((val) => {
										const result = val.filter(
											(reportedWeapon) =>
												reportedWeapon.groupMatchMapId !==
												newReportedWeapon.groupMatchMapId,
										);

										if (typeof newReportedWeapon.weaponSplId === "number") {
											result.push(newReportedWeapon);
										}

										return result;
									});
								}}
							/>
						);
					})}
				</div>
			</Flipper>
			{scoreCanBeReported && isMod(user) ? (
				<div className="stack sm horizontal items-center text-sm font-semi-bold">
					<SendouSwitch
						name="adminReport"
						isSelected={adminToggleChecked}
						onChange={setAdminToggleChecked}
					/>
					Report as admin
				</div>
			) : null}
			{scoreCanBeReported ? (
				<div className="stack md items-center mt-4">
					<ResultSummary winners={winners} />
					<SubmitButton _action="REPORT_SCORE" state={fetcher.state}>
						{isResubmission
							? t("q:match.submitScores.adjusted")
							: t("q:match.submitScores")}
					</SubmitButton>
				</div>
			) : null}
		</fetcher.Form>
	);
}

function MapListMap({
	i,
	map,
	winners,
	setWinners,
	canReportScore,
	weapons,
	ownWeapon,
	onOwnWeaponSelected,
	showReportedOwnWeapon,
	recentlyReportedWeapons,
	addRecentlyReportedWeapon,
}: {
	i: number;
	map: Unpacked<SerializeFrom<typeof loader>["match"]["mapList"]>;
	winners: ("ALPHA" | "BRAVO")[];
	setWinners?: (winners: ("ALPHA" | "BRAVO")[]) => void;
	canReportScore: boolean;
	weapons?: (MainWeaponId | null)[] | null;
	ownWeapon?: MainWeaponId | null;
	onOwnWeaponSelected?: (weapon: ReportedWeaponForMerging | null) => void;
	showReportedOwnWeapon: boolean;
	recentlyReportedWeapons?: MainWeaponId[];
	addRecentlyReportedWeapon?: (weapon: MainWeaponId) => void;
}) {
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["q", "game-misc", "tournament", "weapons"]);

	const handleReportScore = (i: number, side: "ALPHA" | "BRAVO") => () => {
		const newWinners = [...winners];
		newWinners[i] = side;

		// delete any scores that would have been after set ended (can happen when they go back to edit previously reported scores)

		const matchEndedAt = matchEndedAtIndex(newWinners);

		if (matchEndedAt) {
			newWinners.splice(matchEndedAt + 1);
		}

		setWinners?.(newWinners);
	};

	const scoreCanBeReported =
		Boolean(matchEndedAtIndex(winners)) && !data.match.isLocked;
	const showWinnerReportRow = (i: number) => {
		if (!canReportScore) return false;

		if (i === 0) return true;

		if (scoreCanBeReported && !winners[i]) return false;

		const previous = winners[i - 1];
		return Boolean(previous);
	};

	const winningInfoText = (winnerId: number | null) => {
		if (!data.match.isLocked) return null;

		if (!winnerId)
			return (
				<>
					• <i>{t("q:match.results.unplayed")}</i>
				</>
			);

		const winnerSide =
			winnerId === data.match.alphaGroupId
				? t("q:match.sides.alpha")
				: t("q:match.sides.bravo");

		return <>• {t("q:match.won", { side: winnerSide })}</>;
	};

	const relativeSideText = (side: "ALPHA" | "BRAVO") => {
		if (!data.groupMemberOf) return "";

		return data.groupMemberOf === side ? " (us)" : " (them)";
	};

	const modePreferences = data.match.memento?.modePreferences?.[map.mode];

	const userIdToName = (userId: number) => {
		const member = [
			...data.groupAlpha.members,
			...data.groupBravo.members,
		].find((m) => m.id === userId);

		return member?.username ?? "";
	};

	return (
		<div key={map.stageId} className="stack xs">
			<Flipped flipId={map.stageId}>
				<div className="stack sm horizontal items-center">
					<StageImage stageId={map.stageId} width={64} className="rounded-sm" />
					<div>
						<div className="text-sm stack horizontal xs items-center">
							{i + 1}){" "}
							{modePreferences ? (
								<SendouPopover
									popoverClassName="text-main-forced"
									trigger={
										<SendouButton className="q-match__mode-popover-button">
											<ModeImage mode={map.mode} size={18} />
										</SendouButton>
									}
								>
									<div className="text-md text-lighter mb-2 line-height-very-tight">
										{t(`game-misc:MODE_LONG_${map.mode}`)}
									</div>
									{modePreferences.map(({ userId, preference }) => {
										return (
											<div
												key={userId}
												className="stack horizontal items-center xs"
											>
												<img
													src={preferenceEmojiUrl(preference)}
													className="q-settings__radio__emoji"
													width={18}
													alt={`${preference} emoji`}
												/>
												{userIdToName(userId)}
											</div>
										);
									})}
								</SendouPopover>
							) : (
								<ModeImage mode={map.mode} size={18} />
							)}{" "}
							{t(`game-misc:STAGE_${map.stageId}`)}
						</div>
						<div className="text-lighter text-xs stack xxs horizontal">
							<MapListMapPickInfo i={i} map={map} />{" "}
							{winningInfoText(map.winnerGroupId)}
						</div>
					</div>
				</div>
			</Flipped>
			{weapons && map.winnerGroupId && !showReportedOwnWeapon ? (
				<div className="stack sm horizontal">
					{weapons.map((weaponSplId, i) => {
						return (
							<React.Fragment key={i}>
								{typeof weaponSplId === "number" ? (
									<WeaponImage
										weaponSplId={weaponSplId}
										size={30}
										variant="badge"
									/>
								) : (
									<div className="w-4 font-semi-bold stack items-center justify-center">
										?
									</div>
								)}
								{i === 3 ? <div className="w-4" /> : null}
							</React.Fragment>
						);
					})}
				</div>
			) : null}
			{showWinnerReportRow(i) ? (
				<Flipped
					flipId={`${map.stageId}-report`}
					onAppear={async (el: HTMLElement) => {
						await animate(el, [{ opacity: 0 }, { opacity: 1 }], {
							duration: 300,
						});
						el.style.opacity = "1";
					}}
				>
					<div className="q-match__report-section">
						<label className="mb-0 text-theme-secondary">
							{t("q:match.report.winnerLabel")}
						</label>
						<div className="stack items-center">
							<div
								className={clsx("q-match__result-dot", {
									"q-match__result-dot__won": winners[i] === data.groupMemberOf,
									"q-match__result-dot__lost":
										winners[i] && winners[i] !== data.groupMemberOf,
								})}
							/>
						</div>
						<div className="stack sm horizontal items-center">
							<div className="stack sm horizontal items-center font-semi-bold">
								<input
									type="radio"
									name={`winner-${i}`}
									value="alpha"
									id={`alpha-${i}`}
									checked={winners[i] === "ALPHA"}
									onChange={handleReportScore(i, "ALPHA")}
								/>
								<label className="mb-0" htmlFor={`alpha-${i}`}>
									{`${t("q:match.sides.alpha")}${relativeSideText("ALPHA")}`}
								</label>
							</div>
							<div className="stack sm horizontal items-center font-semi-bold">
								<input
									type="radio"
									name={`winner-${i}`}
									value="bravo"
									id={`bravo-${i}`}
									checked={winners[i] === "BRAVO"}
									onChange={handleReportScore(i, "BRAVO")}
								/>
								<label className="mb-0" htmlFor={`bravo-${i}`}>
									{`${t("q:match.sides.bravo")}${relativeSideText("BRAVO")}`}
								</label>
							</div>
						</div>

						{showReportedOwnWeapon && onOwnWeaponSelected ? (
							<>
								<label className="mb-0 text-theme-secondary">
									{t("q:match.report.weaponLabel")}
								</label>
								<div
									className={clsx({ invisible: typeof ownWeapon !== "number" })}
								>
									{typeof ownWeapon === "number" ? (
										<WeaponImage
											weaponSplId={ownWeapon}
											variant="badge"
											size={36}
										/>
									) : (
										<WeaponImage
											weaponSplId={0}
											variant="badge"
											size={36}
											className="invisible"
										/>
									)}
								</div>
								{typeof ownWeapon === "number" ? (
									<div className="font-bold stack sm horizontal">
										{t(`weapons:MAIN_${ownWeapon}`)}
										<Button
											size="tiny"
											icon={<CrossIcon />}
											variant="minimal-destructive"
											onClick={() => {
												const userId = user!.id;
												const groupMatchMapId = map.id;

												onOwnWeaponSelected({
													mapIndex: i,
													groupMatchMapId,
													userId,
												});
											}}
										/>
									</div>
								) : (
									<WeaponCombobox
										inputName="weapon"
										quickSelectWeaponIds={recentlyReportedWeapons}
										onChange={(weapon) => {
											const userId = user!.id;
											const groupMatchMapId = map.id;

											const weaponSplId = Number(weapon?.value) as MainWeaponId;

											addRecentlyReportedWeapon?.(weaponSplId);

											onOwnWeaponSelected(
												weapon
													? {
															weaponSplId,
															mapIndex: i,
															groupMatchMapId,
															userId,
														}
													: null,
											);
										}}
									/>
								)}
							</>
						) : null}
					</div>
				</Flipped>
			) : null}
		</div>
	);
}

function MapListMapPickInfo({
	i,
	map,
}: {
	i: number;
	map: Unpacked<SerializeFrom<typeof loader>["match"]["mapList"]>;
}) {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["q", "game-misc", "tournament"]);

	const pickInfo = (source: string) => {
		if (source === "TIEBREAKER") return t("tournament:pickInfo.tiebreaker");
		if (source === "BOTH") return t("tournament:pickInfo.both");
		if (source === "DEFAULT") return t("tournament:pickInfo.default");

		if (source === String(data.match.alphaGroupId)) {
			return t("tournament:pickInfo.team.specific", {
				team: t("q:match.sides.alpha"),
			});
		}

		return t("tournament:pickInfo.team.specific", {
			team: t("q:match.sides.bravo"),
		});
	};

	const userIdToUser = (userId: number) => {
		const member = [
			...data.groupAlpha.members,
			...data.groupBravo.members,
		].find((m) => m.id === userId);

		return member;
	};

	const sourcePoolMemberIds = () => {
		const result: number[] = [];

		if (!data.match.memento?.pools) return result;

		const pickerGroups = [data.groupAlpha, data.groupBravo].filter(
			(g) => map.source === "BOTH" || String(g.id) === map.source,
		);
		if (pickerGroups.length === 0) return result;

		for (const pickerGroup of pickerGroups) {
			for (const { userId, pool } of data.match.memento.pools) {
				if (!pickerGroup.members.some((m) => m.id === userId)) {
					continue;
				}

				const modePool = pool.find((p) => p.mode === map.mode);
				if (modePool?.stages.includes(map.stageId)) {
					result.push(userId);
				}
			}
		}

		return result;
	};

	const mapPreferences = data.match.memento?.mapPreferences?.[i];
	const showPopover = () => {
		// legacy preference system (season 2)
		if (mapPreferences && mapPreferences.length > 0) return true;

		return sourcePoolMemberIds().length > 0;
	};

	if (showPopover()) {
		return (
			<SendouPopover
				popoverClassName="text-main-forced"
				trigger={
					<SendouButton className="q-match__stage-popover-button">
						{pickInfo(map.source)}
					</SendouButton>
				}
			>
				<div className="text-md text-center text-lighter mb-2 line-height-very-tight">
					{t(`game-misc:MODE_SHORT_${map.mode}`)}{" "}
					{t(`game-misc:STAGE_${map.stageId}`)}
				</div>
				{sourcePoolMemberIds().length > 0 ? (
					<div className="stack sm">
						{sourcePoolMemberIds().map((userId) => {
							const user = userIdToUser(userId);
							return (
								<div
									key={userId}
									className="stack sm horizontal items-center xs"
								>
									<Avatar user={user} size="xxs" />
									{user?.username}
								</div>
							);
						})}
					</div>
				) : mapPreferences ? (
					mapPreferences.map(({ userId, preference }) => {
						return (
							<div key={userId} className="stack horizontal items-center xs">
								<img
									src={preferenceEmojiUrl(preference)}
									className="q-settings__radio__emoji"
									width={18}
									alt={`${preference} emoji`}
								/>
								{userIdToUser(userId)?.username}
							</div>
						);
					})
				) : null}
			</SendouPopover>
		);
	}

	return pickInfo(map.source);
}

function ResultSummary({ winners }: { winners: ("ALPHA" | "BRAVO")[] }) {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	const ownSide = data.groupAlpha.members.some((m) => m.id === user?.id)
		? "ALPHA"
		: "BRAVO";

	const score = winners.reduce(
		(acc, cur) => {
			if (cur === "ALPHA") {
				return [acc[0] + 1, acc[1]];
			}

			return [acc[0], acc[1] + 1];
		},
		[0, 0],
	);

	const userWon =
		ownSide === "ALPHA" ? score[0] > score[1] : score[0] < score[1];

	return (
		<div
			className={clsx("text-sm font-semi-bold", {
				"text-success": userWon,
				"text-warning": !userWon,
			})}
		>
			{t("q:match.reporting", {
				score: score.join("-"),
				outcome: userWon ? t("q:match.outcome.win") : t("q:match.outcome.loss"),
			})}
		</div>
	);
}
