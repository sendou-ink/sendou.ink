import { describe, expect, test } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { wrappedAction } from "~/utils/Test";
import { SENDOUQ_PREPARING_PAGE } from "~/utils/urls";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import type { frontPageSchema } from "../q-action-schemas";
import { sendouQInviteLink } from "../q-urls";
import { action as rawFrontPageAction } from "./q";

const frontPageAction = wrappedAction<typeof frontPageSchema>({
	action: rawFrontPageAction,
});

describe("JOIN_TEAM", () => {
	test("redirects a member using their own group's invite link to the group", async () => {
		const admin = await UserFactory.createAdmin();
		const group = await SQGroupFactory.create({
			status: "PREPARING",
			memberUserIds: [admin.id],
		});
		await refreshSendouQInstance();
		const inviteCode = SendouQ.findOwnGroup(admin.id)!.inviteCode;

		const response = await frontPageAction(
			{ _action: "JOIN_TEAM" },
			{ user: "admin", url: sendouQInviteLink(inviteCode) },
		);

		expect(response.headers.get("Location")).toBe(SENDOUQ_PREPARING_PAGE);
		const members = await db
			.selectFrom("GroupMember")
			.select("userId")
			.where("groupId", "=", group.id)
			.execute();
		expect(members).toEqual([{ userId: admin.id }]);
	});
});
