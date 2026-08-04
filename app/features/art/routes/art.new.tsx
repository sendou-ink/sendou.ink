import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { FormMessage } from "~/components/FormMessage";
import { Main } from "~/components/Main";
import type { CustomFieldRenderProps } from "~/form";
import { SendouForm } from "~/form/SendouForm";
import { useHasRole } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { artPage, navIconUrl } from "~/utils/urls";
import { metaTitle } from "../../../utils/remix";
import { action } from "../actions/art.new.server";
import type { ArtImageValue } from "../art-image";
import { artFormSchema } from "../art-schemas";
import { ArtImageFormField } from "../components/ArtImageFormField";
import { type ArtTag, ArtTagsFormField } from "../components/ArtTagsFormField";
import { loader } from "../loaders/art.new.server";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["art"],
	breadcrumb: () => ({
		imgPath: navIconUrl("art"),
		href: artPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = () => {
	return metaTitle({
		title: "New art",
	});
};

export default function NewArtPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["art"]);
	const isArtist = useHasRole("ARTIST");

	if (!isArtist) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("art:gainPerms")}</Alert>
			</Main>
		);
	}

	const isCurrentlyShowcase = Boolean(data.art?.isShowcase);

	return (
		<Main halfWidth>
			<SendouForm
				schema={artFormSchema}
				defaultValues={{
					artId: data.art?.id,
					img: data.art ? { type: "EXISTING", url: data.art.url } : null,
					description: data.art?.description ?? "",
					tags: data.art?.tags ?? [],
					linkedUsers: data.art?.linkedUsers?.map((user) => user.id) ?? [],
					isShowcase: isCurrentlyShowcase,
				}}
			>
				{({ FormField }) => (
					<>
						<FormMessage type="info">{t("art:forms.caveats")}</FormMessage>
						<FormField name="img">
							{({ value, onChange, error }: CustomFieldRenderProps) => (
								<ArtImageFormField
									value={value as ArtImageValue}
									onChange={onChange as (value: ArtImageValue) => void}
									error={error}
								/>
							)}
						</FormField>
						<FormField name="description" />
						<FormField name="tags">
							{({ value, onChange, error }: CustomFieldRenderProps) => (
								<ArtTagsFormField
									value={value as ArtTag[]}
									onChange={onChange as (value: ArtTag[]) => void}
									error={error}
									existingTags={data.tags}
								/>
							)}
						</FormField>
						<FormField name="linkedUsers" />
						{data.art ? (
							<FormField name="isShowcase" disabled={isCurrentlyShowcase} />
						) : null}
					</>
				)}
			</SendouForm>
		</Main>
	);
}
