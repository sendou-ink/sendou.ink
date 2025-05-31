import type { ActionFunction, LoaderFunctionArgs } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { updatePatreonData } from "~/modules/patreon";
import {
	canAccessLohiEndpoint,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";

export const action: ActionFunction = async ({ request }) => {
	if (!canAccessLohiEndpoint(request)) {
		throw new Response("Not authorized", { status: 403 });
	}

	await updatePatreonData();

	return new Response(null, { status: 204 });
};

export const loader = ({ request }: LoaderFunctionArgs) => {
	unauthorizedIfFalsy(canAccessLohiEndpoint(request));

	return UserRepository.findAllPatrons();
};
