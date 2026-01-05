import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { Alert } from "~/components/Alert";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { LinkIcon } from "~/components/icons/Link";
import { TrashIcon } from "~/components/icons/Trash";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { joinTeamPage } from "~/utils/urls";
import type * as TeamRepository from "../TeamRepository.server";
import {
	CUSTOM_ROLE_MAX_LENGTH,
	OTHER_ROLES,
	PLAYER_ROLES,
} from "../team-constants";
import { isTeamFull } from "../team-utils";
import "../team.css";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { metaTags } from "~/utils/remix";

import { action } from "../actions/t.$customUrl.roster.server";
import { loader } from "../loaders/t.$customUrl.roster.server";
export { loader, action };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Managing team roster",
		location: args.location,
	});
};

// xxx: review all code here

const CUSTOM_ROLE_VALUE = "CUSTOM";

type Member = TeamRepository.findByCustomUrl["members"][number];

type MemberState = {
	userId: number;
	role: string;
	customRole: string;
	roleType: "PLAYER" | "OTHER" | "";
	isManager: boolean;
};

function getInitialMembers(teamMembers: Member[]): MemberState[] {
	return [...teamMembers]
		.sort((a, b) => {
			const aOrder = a.memberOrder ?? Number.MAX_SAFE_INTEGER;
			const bOrder = b.memberOrder ?? Number.MAX_SAFE_INTEGER;
			return aOrder - bOrder;
		})
		.map((m) => ({
			userId: m.id,
			role: m.customRole ? "" : (m.role ?? ""),
			customRole: m.customRole ?? "",
			roleType: m.roleType ?? "",
			isManager: Boolean(m.isManager),
		}));
}

function hasUnsavedChanges(
	original: MemberState[],
	current: MemberState[],
): boolean {
	if (original.length !== current.length) return true;

	for (let i = 0; i < original.length; i++) {
		const orig = original[i];
		const curr = current[i];

		if (
			orig.userId !== curr.userId ||
			orig.role !== curr.role ||
			orig.customRole !== curr.customRole ||
			orig.roleType !== curr.roleType ||
			orig.isManager !== curr.isManager
		) {
			return true;
		}
	}

	return false;
}

export default function ManageTeamRosterPage() {
	const { t } = useTranslation(["team", "common"]);
	const { team } = useLoaderData<typeof loader>();
	const navigation = useNavigation();
	const fetcher = useFetcher();

	const initialMembers = React.useRef(getInitialMembers(team.members));
	const [members, setMembers] = React.useState<MemberState[]>(() =>
		getInitialMembers(team.members),
	);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const teamMembersById = new Map(team.members.map((m) => [m.id, m]));
	const membersSortedWithData = members
		.filter((m) => teamMembersById.has(m.userId))
		.map((m) => ({
			...m,
			member: teamMembersById.get(m.userId)!,
		}));

	const allMemberIds = membersSortedWithData.map((m) => m.userId);

	const unsavedChanges = hasUnsavedChanges(initialMembers.current, members);

	const handleDragEnd = (event: {
		active: { id: number | string };
		over: { id: number | string } | null;
	}) => {
		const { active, over } = event;

		if (!over || active.id === over.id) return;

		const activeId = active.id as number;
		const overId = over.id as number;

		setMembers((currentMembers) => {
			const oldIndex = currentMembers.findIndex((m) => m.userId === activeId);
			const newIndex = currentMembers.findIndex((m) => m.userId === overId);
			return arrayMove(currentMembers, oldIndex, newIndex);
		});
	};

	const handleMemberUpdate = (
		userId: number,
		updates: Partial<Omit<MemberState, "userId">>,
	) => {
		setMembers((currentMembers) =>
			currentMembers.map((m) =>
				m.userId === userId ? { ...m, ...updates } : m,
			),
		);
	};

	return (
		<Main className="stack lg">
			<div className="team__roster__top-row">
				<TeamGoBackButton />
				<InviteCodeSection />
			</div>
			<fetcher.Form method="post" className="stack md">
				<input type="hidden" name="_action" value="BULK_UPDATE_ROSTER" />
				<input type="hidden" name="members" value={JSON.stringify(members)} />

				<Alert
					variation={unsavedChanges ? "WARNING" : "INFO"}
					alertClassName="w-max"
					textClassName="stack horizontal md items-center"
				>
					{unsavedChanges
						? t("team:roster.order.unsavedChanges")
						: t("team:roster.order.dragToReorder")}
					<SubmitButton
						state={fetcher.state}
						isDisabled={!unsavedChanges}
						size="small"
					>
						{t("common:actions.save")}
					</SubmitButton>
				</Alert>

				<DndContext
					id="team-roster-sorter"
					sensors={sensors}
					onDragEnd={handleDragEnd}
				>
					<div className="team__roster__members">
						<SortableContext
							items={allMemberIds}
							strategy={verticalListSortingStrategy}
						>
							{membersSortedWithData.map((memberData, i) => (
								<DraggableMemberRow
									key={memberData.userId}
									member={memberData.member}
									memberState={memberData}
									number={i}
									disabled={navigation.state !== "idle"}
									testId={`member-row-${i}`}
									onMemberUpdate={handleMemberUpdate}
								/>
							))}
						</SortableContext>
					</div>
				</DndContext>
			</fetcher.Form>
			<SendouPopover
				trigger={
					<SendouButton
						className="self-start italic"
						size="small"
						variant="minimal"
					>
						{t("team:editorsInfo.button")}
					</SendouButton>
				}
			>
				{t("team:editorsInfo.popover")}
			</SendouPopover>
		</Main>
	);
}

function InviteCodeSection() {
	const { t } = useTranslation(["common", "team"]);
	const { team } = useLoaderData<typeof loader>();

	if (isTeamFull(team)) {
		return (
			<Alert variation="INFO" alertClassName="w-max">
				{t("team:roster.teamFull")}
			</Alert>
		);
	}

	const inviteLink = `${import.meta.env.VITE_SITE_DOMAIN}${joinTeamPage({
		customUrl: team.customUrl,
		inviteCode: team.inviteCode!,
	})}`;

	return (
		<div className="team__roster__invite-row" data-testid="invite-link">
			<CopyToClipboardPopover
				url={inviteLink}
				trigger={
					<SendouButton size="small" variant="outlined" icon={<LinkIcon />}>
						{t("team:roster.inviteLink.header")}
					</SendouButton>
				}
			/>
			<Form method="post">
				<SubmitButton
					variant="minimal-destructive"
					_action="RESET_INVITE_LINK"
					size="small"
					testId="reset-invite-link-button"
				>
					{t("common:actions.reset")}
				</SubmitButton>
			</Form>
		</div>
	);
}

function DraggableMemberRow({
	member,
	memberState,
	number,
	disabled,
	testId,
	onMemberUpdate,
}: {
	member: Member;
	memberState: MemberState;
	number: number;
	disabled: boolean;
	testId: string;
	onMemberUpdate: (
		userId: number,
		updates: Partial<Omit<MemberState, "userId">>,
	) => void;
}) {
	const { team } = useLoaderData<typeof loader>();
	const { t } = useTranslation(["team"]);
	const user = useUser();

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: member.id, disabled });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isSelf = user!.id === member.id;
	const isInCustomMode =
		memberState.customRole !== "" ||
		(memberState.role === "" && memberState.roleType !== "");
	const currentRole = isInCustomMode ? CUSTOM_ROLE_VALUE : memberState.role;

	const isThisMemberOwner = Boolean(
		team.members.find((m) => m.id === member.id)?.isOwner,
	);

	const handleRoleChange = (newRole: string) => {
		if (newRole === CUSTOM_ROLE_VALUE) {
			onMemberUpdate(member.id, {
				role: "",
				customRole: memberState.customRole || "",
				roleType: memberState.roleType || "PLAYER",
			});
			return;
		}

		onMemberUpdate(member.id, {
			role: newRole,
			customRole: "",
			roleType: "",
		});
	};

	const showActions = !isThisMemberOwner && !isSelf;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={clsx("team__roster__card", {
				"team__roster__card--dragging": isDragging,
				"team__roster__card--disabled": disabled,
			})}
			data-testid={testId}
			{...attributes}
		>
			<div className="team__roster__card-header">
				<span className="team__roster__drag-handle" {...listeners}>
					☰
				</span>
				<span className="team__roster__member-name">{member.username}</span>
			</div>

			<div className="team__roster__card-body">
				<div className="team__roster__role-section">
					<select
						value={currentRole}
						onChange={(e) => handleRoleChange(e.target.value)}
						data-testid={`role-select-${number}`}
						className="team__roster__role-select"
					>
						<option value="">No role</option>
						<optgroup label={t("team:roster.sections.players")}>
							{PLAYER_ROLES.map((role) => (
								<option key={role} value={role}>
									{t(`team:roles.${role}`)}
								</option>
							))}
						</optgroup>
						<optgroup label={t("team:roster.sections.other")}>
							{OTHER_ROLES.map((role) => (
								<option key={role} value={role}>
									{t(`team:roles.${role}`)}
								</option>
							))}
						</optgroup>
						<option value={CUSTOM_ROLE_VALUE}>{t("team:roles.CUSTOM")}</option>
					</select>

					{isInCustomMode ? (
						<div className="team__roster__custom-role">
							<input
								type="text"
								value={memberState.customRole}
								onChange={(e) =>
									onMemberUpdate(member.id, { customRole: e.target.value })
								}
								placeholder={t("team:roster.customRole.placeholder")}
								maxLength={CUSTOM_ROLE_MAX_LENGTH}
								className="team__roster__custom-role-input"
							/>
							<select
								value={memberState.roleType || "PLAYER"}
								onChange={(e) =>
									onMemberUpdate(member.id, {
										roleType: e.target.value as "PLAYER" | "OTHER",
									})
								}
								className="team__roster__role-type-select"
							>
								<option value="PLAYER">
									{t("team:roster.roleType.PLAYER")}
								</option>
								<option value="OTHER">{t("team:roster.roleType.OTHER")}</option>
							</select>
						</div>
					) : null}
				</div>

				{showActions ? (
					<div className="team__roster__card-actions">
						<SendouSwitch
							onChange={(isSelected) =>
								onMemberUpdate(member.id, { isManager: isSelected })
							}
							isSelected={memberState.isManager}
							data-testid="editor-switch"
						>
							{t("team:editor.label")}
						</SendouSwitch>
						<FormWithConfirm
							dialogHeading={t("team:kick.header", {
								teamName: team.name,
								user: member.username,
							})}
							submitButtonText={t("team:actionButtons.kick")}
							fields={[
								["_action", "DELETE_MEMBER"],
								["userId", member.id],
							]}
						>
							<SendouButton
								size="small"
								variant="destructive"
								icon={<TrashIcon />}
								data-testid={!isSelf ? "kick-button" : undefined}
							>
								{t("team:actionButtons.kick")}
							</SendouButton>
						</FormWithConfirm>
					</div>
				) : null}
			</div>
		</div>
	);
}
