import { type LoaderFunctionArgs, redirect } from "react-router";
import { parseParams } from "~/utils/remix.server";
import { tournamentSubsPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	throw redirect(tournamentSubsPage(tournamentId));
};
