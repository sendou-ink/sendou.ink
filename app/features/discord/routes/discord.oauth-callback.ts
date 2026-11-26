import type { LoaderFunctionArgs } from "react-router";
import * as DiscordOAuth from "~/features/auth/core/DiscordOAuth.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import {
	errorToastWithRedirect,
	successToastWithRedirect,
} from "~/utils/remix.server";
import * as DiscordAPI from "../core/DiscordAPI.server";
import * as LinkedRoles from "../core/LinkedRoles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const tokens = await authenticate(request);

	const discordId = await DiscordAPI.fetchUserId(tokens.accessToken);
	const user = await UserRepository.findIdByIdentifier(discordId);
	if (!user) {
		errorToastWithRedirect({
			url: "/",
			message:
				"No sendou.ink account found for your Discord account. Log in to sendou.ink once and try again.",
		});
	}

	await LinkedRoles.saveTokens(user.id, tokens);

	try {
		await LinkedRoles.syncUser(user.id);
	} catch (error) {
		logger.error("Syncing Discord linked role after linking:", error);
		errorToastWithRedirect({
			url: "/",
			message:
				"Linked, but updating your Discord roles failed. They will be updated within a day.",
		});
	}

	successToastWithRedirect({
		url: "/",
		message: "Linked! Your Discord roles are now up to date.",
	});
};

async function authenticate(request: Request) {
	try {
		return await DiscordAPI.exchangeLinkedRoleCode(request);
	} catch (error) {
		if (
			error instanceof DiscordOAuth.OAuthError &&
			error.code === "access_denied"
		) {
			errorToastWithRedirect({ url: "/", message: "Linking was cancelled" });
		}

		logger.error("Discord linked role authentication:", error);
		errorToastWithRedirect({
			url: "/",
			message: "Linking failed, please try again",
		});
	}
}
