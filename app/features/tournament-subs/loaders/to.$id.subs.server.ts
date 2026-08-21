import { type LoaderFunctionArgs, redirect } from "react-router";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { tournamentSubsPage } from "~/utils/urls";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	throw redirect(tournamentSubsPage(tournamentId));
};
