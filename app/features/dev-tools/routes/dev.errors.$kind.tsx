import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import * as v from "valibot";
import { Catcher } from "~/components/Catcher";
import {
	forbidden,
	notFound,
	parseParams,
	unauthorized,
} from "~/utils/remix.server";
import { DEV_ERROR_KINDS } from "../dev-tools-constants";
import { requireDevTools } from "../dev-tools-utils.server";

export const loader = ({ request, params }: LoaderFunctionArgs) => {
	requireDevTools(request);

	const { kind } = parseParams({
		params,
		schema: v.object({ kind: v.picklist(DEV_ERROR_KINDS) }),
	});

	switch (kind) {
		case "404":
			notFound();
			break;
		case "401":
			unauthorized();
			break;
		case "403":
			forbidden();
			break;
		case "500":
			throw new Error("Thrown on purpose by the dev tools");
	}

	return { kind };
};

export default function DevErrorPage() {
	const { kind } = useLoaderData<typeof loader>();

	throw new Error(
		`Thrown on purpose by the dev tools while rendering (${kind})`,
	);
}

export const ErrorBoundary = Catcher;
