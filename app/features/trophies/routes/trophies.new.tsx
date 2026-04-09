import { Clipboard, Trash2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	type MetaFunction,
	useFetcher,
	useLoaderData,
} from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { OrganizationSearch } from "~/components/elements/OrganizationSearch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, TROPHIES_PAGE } from "~/utils/urls";
import { action } from "../actions/trophies.new.server";
import { Trophy, TrophyContextProvider } from "../components/Trophy";
import {
	loader,
	type NewTrophyLoaderData,
} from "../loaders/trophies.new.server";
import { TROPHY_DECLINE_REASON_MAX_LENGTH } from "../trophies-constants";
import { createTrophyFormSchema } from "../trophies-schemas";
import styles from "./trophies.new.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: "trophies",
	breadcrumb: () => ({
		imgPath: navIconUrl("trophies"),
		href: TROPHIES_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "New trophy",
		ogTitle: "Submit a new trophy",
		location: args.location,
		description: "Submit a new trophy for review.",
	});
};

export default function NewTrophyPage() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main halfWidth>
			<SendouTabs>
				<SendouTabList>
					<SendouTab id="upload">{t("trophies:new.tabs.upload")}</SendouTab>
					<SendouTab id="pending" number={data.pendingTrophies.length}>
						{t("trophies:new.tabs.pending")}
					</SendouTab>
					<SendouTab id="reviewed">{t("trophies:new.tabs.reviewed")}</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="upload">
					<NewTrophyForm />
				</SendouTabPanel>
				<SendouTabPanel id="pending">
					<TrophyList items={data.pendingTrophies} listKind="pending" />
				</SendouTabPanel>
				<SendouTabPanel id="reviewed">
					<TrophyList items={data.reviewedTrophies} listKind="reviewed" />
				</SendouTabPanel>
			</SendouTabs>
		</Main>
	);
}

function NewTrophyForm() {
	return (
		<SendouForm schema={createTrophyFormSchema}>
			{({ names, FormField }) => (
				<>
					<FormField name={names.name} />
					<FormField name={names.model}>
						{({ name, error, value, onChange }: CustomFieldRenderProps) => (
							<ModelField
								name={name}
								error={error}
								value={value as string}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name={names.organizationId}>
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<OrganizationField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name={names.description} />
				</>
			)}
		</SendouForm>
	);
}

function ModelField({
	name,
	error,
	value,
	onChange,
}: {
	name: string;
	error?: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const { t } = useTranslation(["forms"]);

	return (
		<div>
			<Label htmlFor={name} required>
				{t("forms:labels.trophyModel")}
			</Label>
			<textarea
				id={name}
				className={styles.modelTextarea}
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
				spellCheck={false}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
		</div>
	);
}

function OrganizationField({
	error,
	value,
	onChange,
}: {
	error?: string;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	const { t } = useTranslation(["forms"]);

	return (
		<div>
			<Label required>{t("forms:labels.trophyOrganization")}</Label>
			<OrganizationSearch
				initialOrganizationId={value ?? undefined}
				onChange={(org) => onChange(org?.id ?? null)}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
		</div>
	);
}

function TrophyList({
	items,
	listKind,
}: {
	items: NewTrophyLoaderData["pendingTrophies"];
	listKind: "pending" | "reviewed";
}) {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();

	if (items.length === 0) {
		return (
			<Alert>
				{listKind === "pending"
					? t("trophies:new.pending.empty")
					: t("trophies:new.reviewed.empty")}
			</Alert>
		);
	}

	return (
		<TrophyContextProvider>
			<div className={styles.pendingList}>
				{items.map((item) => (
					<TrophyListRow
						key={item.id}
						pending={item}
						currentUserId={data.currentUserId}
						canReview={data.canReview}
					/>
				))}
			</div>
		</TrophyContextProvider>
	);
}

function TrophyListRow({
	pending,
	currentUserId,
	canReview,
}: {
	pending: NewTrophyLoaderData["pendingTrophies"][number];
	currentUserId: number;
	canReview: boolean;
}) {
	const { t } = useTranslation(["trophies", "common"]);
	const fetcher = useFetcher();

	const isOwner = pending.submitterUserId === currentUserId;
	const isDeclined = pending.declinedAt !== null;
	const isAccepted = pending.acceptedAt !== null;
	const isReviewed = isDeclined || isAccepted;

	const handleDelete = () => {
		const formData = new FormData();
		formData.append("_action", "DELETE");
		formData.append("pendingTrophyId", String(pending.id));
		fetcher.submit(formData, { method: "post" });
	};

	const handleAccept = () => {
		const formData = new FormData();
		formData.append("_action", "ACCEPT");
		formData.append("pendingTrophyId", String(pending.id));
		fetcher.submit(formData, { method: "post" });
	};

	return (
		<div className={styles.pendingItem}>
			<Trophy model={pending.model} preview />
			<div className={styles.pendingMain}>
				<div className={styles.pendingHeader}>
					<span className={styles.pendingName}>{pending.name}</span>
					<span className={styles.pendingMeta}>
						{pending.submitterUsername}
						{pending.organizationName ? ` • ${pending.organizationName}` : ""}
					</span>
				</div>
				{pending.description ? (
					<div className={styles.pendingDescription}>{pending.description}</div>
				) : null}
				{isAccepted ? (
					<div className={styles.accepted}>
						<p>
							{pending.acceptedByUsername
								? t("trophies:new.pending.acceptedBy", {
										name: pending.acceptedByUsername,
									})
								: t("trophies:new.pending.accepted")}
						</p>
					</div>
				) : null}
				{isDeclined ? (
					<div className={styles.declined}>
						<p>
							{pending.declinedByUsername
								? t("trophies:new.pending.declinedBy", {
										name: pending.declinedByUsername,
									})
								: t("trophies:new.pending.declined")}
						</p>
						<div>{pending.declineReason}</div>
					</div>
				) : null}
				<div className={styles.pendingActions}>
					{canReview && !isReviewed ? (
						<>
							<SendouButton
								variant="outlined"
								size="small"
								onPress={handleAccept}
								isDisabled={fetcher.state !== "idle"}
							>
								{t("trophies:new.pending.accept")}
							</SendouButton>
							<SendouButton
								variant="outlined"
								size="small"
								shape="square"
								icon={<Clipboard size={16} />}
								onPress={() => navigator.clipboard.writeText(pending.model)}
							/>
							<DeclineButton pendingTrophyId={pending.id} />
						</>
					) : null}
					{isOwner || canReview ? (
						<SendouButton
							variant="minimal-destructive"
							size="small"
							shape="square"
							onPress={handleDelete}
							isDisabled={fetcher.state !== "idle"}
							icon={<Trash2 size={16} />}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

function DeclineButton({ pendingTrophyId }: { pendingTrophyId: number }) {
	const { t } = useTranslation(["trophies"]);
	const [isOpen, setIsOpen] = React.useState(false);
	const [reason, setReason] = React.useState("");
	const fetcher = useFetcher();
	const id = React.useId();

	React.useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data === null && isOpen) {
			setIsOpen(false);
			setReason("");
		}
	}, [fetcher.state, fetcher.data, isOpen]);

	return (
		<>
			<SendouButton
				variant="outlined-destructive"
				size="small"
				onPress={() => setIsOpen(true)}
			>
				{t("trophies:new.pending.decline")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog
					heading={t("trophies:new.pending.declineHeading")}
					isOpen={isOpen}
					onClose={() => setIsOpen(false)}
					showCloseButton
				>
					<Form
						method="post"
						className={styles.dialogForm}
						onSubmit={(e) => {
							e.preventDefault();
							const formData = new FormData();
							formData.append("_action", "DECLINE");
							formData.append("pendingTrophyId", String(pendingTrophyId));
							formData.append("reason", reason);
							fetcher.submit(formData, { method: "post" });
						}}
					>
						<div>
							<Label
								htmlFor={id}
								required
								valueLimits={{
									current: reason.length,
									max: TROPHY_DECLINE_REASON_MAX_LENGTH,
								}}
							>
								{t("trophies:new.pending.declineReason")}
							</Label>
							<textarea
								id={id}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								maxLength={TROPHY_DECLINE_REASON_MAX_LENGTH}
								required
							/>
						</div>
						<SendouButton
							type="submit"
							variant="destructive"
							isDisabled={!reason.trim() || fetcher.state !== "idle"}
						>
							{t("trophies:new.pending.decline")}
						</SendouButton>
					</Form>
				</SendouDialog>
			) : null}
		</>
	);
}
