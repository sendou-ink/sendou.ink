import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { FormMessage } from "~/components/FormMessage";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { Main } from "~/components/Main";
import {
	BaseVisibilityFormField,
	NotFoundVisibilityFormField,
} from "~/features/associations/components/VisibilityFormFields";
import type { CustomFieldRenderProps } from "~/form";
import { SendouForm } from "~/form/SendouForm";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { lobbiesPage, navIconUrl } from "~/utils/urls";
import { action } from "../actions/lobbies.new.server";
import { loader } from "../loaders/lobbies.new.server";
import { newLobbySchema } from "../lobbies-schemas";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "New lobby",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["lobbies", "scrims"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lobbies"),
		href: lobbiesPage(),
		type: "IMAGE",
	}),
};

export default function NewLobbyPage() {
	const { t } = useTranslation(["lobbies"]);
	const data = useLoaderData<typeof loader>();

	if (!data.hasFriendCode) {
		return (
			<Main>
				<div className="stack md items-start">
					<FormMessage type="info">
						{t("lobbies:new.friendCodeNeeded")}
					</FormMessage>
					<FriendCodePopover />
				</div>
			</Main>
		);
	}

	return (
		<Main>
			<SendouForm
				schema={newLobbySchema}
				title={t("lobbies:new.title")}
				defaultValues={{
					name: null,
					label: "CASUAL",
					startsAt: new Date(),
					bestOf: "3",
					modes: ["SZ", "TC", "RM", "CB"],
					roomSize: "10",
					baseVisibility: "PUBLIC",
					notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
				}}
			>
				{({ FormField }) => (
					<>
						<FormField name="name" />
						<FormField name="label" />
						<FormField name="startsAt" />
						<FormField name="bestOf" />
						<FormField name="modes" />
						<FormField name="roomSize" />
						<FormField name="baseVisibility">
							{(props: CustomFieldRenderProps) => (
								<BaseVisibilityFormField
									associations={data.associations}
									{...props}
								/>
							)}
						</FormField>
						<NotFoundVisibilityFormField associations={data.associations} />
					</>
				)}
			</SendouForm>
		</Main>
	);
}
