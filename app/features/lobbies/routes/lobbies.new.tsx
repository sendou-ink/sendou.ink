import { Trans, useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { FormMessage } from "~/components/FormMessage";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { Main } from "~/components/Main";
import {
	BaseVisibilityFormField,
	NotFoundVisibilityFormField,
} from "~/features/associations/components/VisibilityFormFields";
import type { CustomFieldRenderProps } from "~/form";
import { SendouForm } from "~/form/SendouForm";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { lobbiesPage, lobbyPage, navIconUrl, SUPPORT_PAGE } from "~/utils/urls";
import { action } from "../actions/lobbies.new.server";
import { LobbyMapsFormFields } from "../components/LobbyMapsFormFields";
import { loader } from "../loaders/lobbies.new.server";
import { editLobbySchema, newLobbySchema } from "../lobbies-schemas";

export { action, loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	return metaTags({
		title: args.loaderData?.lobbyToEdit ? "Edit lobby" : "New lobby",
		image: ogPageImage("lobbies"),
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
	const isLobbyAdder = useHasRole("LOBBY_ADDER");

	if (data.lobbyToEdit) {
		return (
			<Main>
				<EditLobbyForm
					lobby={data.lobbyToEdit}
					associations={data.associations}
				/>
			</Main>
		);
	}

	if (!isLobbyAdder) {
		return (
			<Main halfWidth className="stack items-center">
				<Alert variation="WARNING">
					<Trans
						t={t}
						i18nKey="lobbies:new.noPermissions"
						components={{ supportLink: <Link to={SUPPORT_PAGE} /> }}
					/>
				</Alert>
			</Main>
		);
	}

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
					description: null,
					label: "CASUAL",
					startsAt: new Date(),
					bestOf: "3",
					maps: "RANKED",
					mapsTournamentId: null,
					mapPool: "",
					weaponRandomizer: "OFF",
					spectators: "0",
					isApplicationRequired: false,
					baseVisibility: "PUBLIC",
					notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
				}}
			>
				{({ FormField }) => (
					<>
						<FormField name="name" />
						<FormField name="description" />
						<FormField name="label" />
						<FormField name="startsAt" />
						<FormField name="bestOf" />
						<LobbyMapsFormFields />
						<FormField name="weaponRandomizer" />
						<FormField name="spectators" />
						<FormField name="isApplicationRequired" />
						<FormField name="baseVisibility">
							{(props: CustomFieldRenderProps) => (
								<BaseVisibilityFormField
									associations={data.associations}
									isLinkOnlyAvailable
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

type NewLobbyLoaderData = SerializeFrom<typeof loader>;

function EditLobbyForm({
	lobby,
	associations,
}: {
	lobby: NonNullable<NewLobbyLoaderData["lobbyToEdit"]>;
	associations: NewLobbyLoaderData["associations"];
}) {
	const { t } = useTranslation(["lobbies", "common"]);
	const { at, forAssociation } = lobby.visibility.notFoundVisibility;

	return (
		<SendouForm
			schema={editLobbySchema}
			action={lobbyPage(lobby.id)}
			title={t("lobbies:edit.title")}
			submitButtonText={t("common:actions.save")}
			defaultValues={{
				name: lobby.name,
				description: lobby.description,
				label: lobby.label,
				bestOf: `${lobby.bestOf}`,
				...lobby.maps,
				weaponRandomizer: lobby.weaponRandomizer,
				isApplicationRequired: lobby.isApplicationRequired,
				baseVisibility: lobby.visibility.baseVisibility,
				notFoundVisibility: {
					at: at === null ? null : databaseTimestampToDate(at),
					forAssociation,
				},
			}}
		>
			{({ FormField }) => (
				<>
					<FormField name="name" />
					<FormField name="description" />
					<FormField name="label" />
					{lobby.hasStarted ? (
						<p className="text-lighter text-sm">
							{t("lobbies:settings.appliesFromNextSet")}
						</p>
					) : null}
					<FormField name="bestOf" />
					<LobbyMapsFormFields />
					<FormField name="weaponRandomizer" />
					<FormField name="isApplicationRequired" />
					<FormField name="baseVisibility">
						{(props: CustomFieldRenderProps) => (
							<BaseVisibilityFormField
								associations={associations}
								isLinkOnlyAvailable
								{...props}
							/>
						)}
					</FormField>
					<NotFoundVisibilityFormField associations={associations} />
				</>
			)}
		</SendouForm>
	);
}
