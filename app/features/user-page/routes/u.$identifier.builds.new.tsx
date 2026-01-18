import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import { Alert } from "~/components/Alert";
import { Main } from "~/components/Main";
import { BUILD } from "~/features/builds/builds-constants";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/u.$identifier.builds.new.server";
import { NewBuildForm } from "../components/NewBuildForm";
import { loader } from "../loaders/u.$identifier.builds.new.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";

export { action, loader };

import { mainStyles } from "~/components/Main";

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear"],
};

export default function NewBuildPage() {
	const { defaultValues, gearIdToAbilities } = useLoaderData<typeof loader>();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const { t } = useTranslation(["builds"]);

	if (layoutData.user.buildsCount >= BUILD.MAX_COUNT) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("builds:reachBuildMaxCount")}</Alert>
			</Main>
		);
	}

	return (
		<div className="half-width u__build-form">
			<NewBuildForm
				defaultValues={defaultValues}
				gearIdToAbilities={gearIdToAbilities}
				isEditing={defaultValues?.buildToEditId != null}
			/>
		</div>
	);
}
