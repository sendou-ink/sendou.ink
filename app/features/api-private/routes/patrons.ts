import type { LoaderFunctionArgs } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { updatePatreonData } from "~/modules/patreon";
import {
	canAccessLohiEndpoint,
	forbidden,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";

export const action = defineAction(async ({ request }) => {
	if (!canAccessLohiEndpoint(request)) {
		forbidden();
	}

	await updatePatreonData();

	return null;
});

export const loader = ({ request }: LoaderFunctionArgs) => {
	unauthorizedIfFalsy(canAccessLohiEndpoint(request));

	return UserRepository.findAllPatrons();
};
