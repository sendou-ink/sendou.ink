import clsx from "clsx";
import { Clipboard, Trash2 } from "lucide-react";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
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
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	PICOCAD2_WEB_VIEWER_URL,
	SENDOU_INK_DISCORD_URL,
	TROPHIES_PAGE,
} from "~/utils/urls";
import { action } from "../actions/trophies.new.server";
import { Trophy, TrophyContextProvider } from "../components/Trophy";
import {
	loader,
	type NewTrophyLoaderData,
} from "../loaders/trophies.new.server";
import {
	TROPHY_APPROVALS_REQUIRED,
	TROPHY_DECLINE_REASON_MAX_LENGTH,
	TROPHY_PENDING_PER_USER_LIMIT,
} from "../trophies-constants";
import {
	createTrophyFormSchema,
	updateTrophyFormSchema,
} from "../trophies-schemas";
import {
	compressTrophyModel,
	decompressTrophyModel,
	useProgressiveRender,
	useTrophyTermsAgreement,
} from "../trophies-utils";
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
					<SendouTab
						id="update"
						isDisabled={data.editableTrophies.length === 0}
					>
						{t("trophies:new.tabs.update")}
					</SendouTab>
					<SendouTab id="pending" number={data.pendingTrophies.length}>
						{t("trophies:new.tabs.pending")}
					</SendouTab>
					<SendouTab id="reviewed">{t("trophies:new.tabs.reviewed")}</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="upload">
					{data.ownUnreviewedCount >= TROPHY_PENDING_PER_USER_LIMIT ? (
						<Alert variation="WARNING">
							{t("trophies:new.form.limitReached", {
								limit: TROPHY_PENDING_PER_USER_LIMIT,
							})}
						</Alert>
					) : (
						<TrophyTermsGate>
							<NewTrophyForm key={data.ownUnreviewedCount} />
						</TrophyTermsGate>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="update">
					{data.ownUnreviewedCount >= TROPHY_PENDING_PER_USER_LIMIT ? (
						<Alert variation="WARNING">
							{t("trophies:new.form.limitReached", {
								limit: TROPHY_PENDING_PER_USER_LIMIT,
							})}
						</Alert>
					) : (
						<UpdateTrophyTab key={data.ownUnreviewedCount} />
					)}
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

function TrophyTermsGate({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation(["trophies"]);
	const { hasAgreedToTerms, agreeToTerms } = useTrophyTermsAgreement();

	if (hasAgreedToTerms) return children;

	return (
		<div className={styles.terms}>
			<h2 className={styles.termsTitle}>{t("trophies:new.terms.title")}</h2>
			<p>{t("trophies:new.terms.intro")}</p>
			<div>
				<p className={styles.termsGroupTitle}>
					{t("trophies:new.terms.oneOff.title")}
				</p>
				<ul className={styles.termsList}>
					<li>{t("trophies:new.terms.trustedOrg")}</li>
					<li>{t("trophies:new.terms.oneOff.pastTournaments")}</li>
					<li>{t("trophies:new.terms.oneOff.projectedTeams")}</li>
					<li>{t("trophies:new.terms.oneOff.signedUpTeams")}</li>
				</ul>
			</div>
			<div>
				<p className={styles.termsGroupTitle}>
					{t("trophies:new.terms.series.title")}
				</p>
				<ul className={styles.termsList}>
					<li>{t("trophies:new.terms.trustedOrg")}</li>
					<li>{t("trophies:new.terms.series.consistentTeams")}</li>
				</ul>
			</div>
			<div>
				<p className={styles.termsDisclaimer}>
					{t("trophies:new.terms.disclaimer")}
				</p>
				<p>
					<Trans t={t} i18nKey="trophies:new.terms.preApproval">
						If you are unsure if your tournament is eligible, feel free to
						acquire a pre-approval by creating a pre-approval request in the
						<a
							href={SENDOU_INK_DISCORD_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							Discord server
						</a>
						.
					</Trans>
				</p>
			</div>
			<SendouButton className={styles.termsAgreeButton} onPress={agreeToTerms}>
				{t("trophies:new.terms.agree")}
			</SendouButton>
		</div>
	);
}

function NewTrophyForm() {
	return (
		<SendouForm schema={createTrophyFormSchema}>
			{({ names, FormField }) => (
				<>
					<FormField name={names.name} />
					<FormField name={names.organizationId}>
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<OrganizationField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
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
					<FormField name={names.description} />
				</>
			)}
		</SendouForm>
	);
}

function UpdateTrophyTab() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();
	const [selectedId, setSelectedId] = React.useState<number | null>(null);

	const selectedTrophy = data.editableTrophies.find((t) => t.id === selectedId);

	return (
		<div className={styles.updateContainer}>
			<SendouSelect
				label={t("trophies:new.update.selectLabel")}
				items={data.editableTrophies}
				search={{ placeholder: t("trophies:new.update.searchPlaceholder") }}
				selectedKey={selectedId}
				onSelectionChange={(key) => setSelectedId(key as number)}
			>
				{(trophy) => (
					<SendouSelectItem
						key={trophy.id}
						id={trophy.id}
						textValue={trophy.name}
					>
						{trophy.name}
					</SendouSelectItem>
				)}
			</SendouSelect>
			{selectedTrophy ? (
				<UpdateTrophyForm key={selectedTrophy.id} trophy={selectedTrophy} />
			) : null}
		</div>
	);
}

function UpdateTrophyForm({
	trophy,
}: {
	trophy: NewTrophyLoaderData["editableTrophies"][number];
}) {
	const decompressedModel = React.useMemo(
		() => decompressTrophyModel(trophy.model) ?? "",
		[trophy.model],
	);

	return (
		<SendouForm
			schema={updateTrophyFormSchema}
			defaultValues={{
				targetTrophyId: trophy.id,
				name: trophy.name,
				model: decompressedModel,
				organizationId: trophy.organizationId,
				managerId: trophy.managerId,
				description: "",
			}}
		>
			{({ names, FormField }) => (
				<>
					<FormField name={names.name} />
					<FormField name={names.organizationId}>
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<OrganizationField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name={names.managerId}>
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<ManagerField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
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
					<FormField name={names.description} />
				</>
			)}
		</SendouForm>
	);
}

function ManagerField({
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
			<Label required>{t("forms:labels.trophyManager")}</Label>
			<UserSearch
				initialUserId={value ?? undefined}
				onChange={(user) => onChange(user?.id ?? null)}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
		</div>
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
	const { t } = useTranslation(["forms", "trophies"]);
	const [previewModel, setPreviewModel] = React.useState(() =>
		value ? compressTrophyModel(value) : "",
	);
	const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

	const handleChange = (newValue: string) => {
		onChange(newValue);
		clearTimeout(timerRef.current);

		timerRef.current = setTimeout(() => {
			setPreviewModel(newValue ? compressTrophyModel(newValue) : "");
		}, 500);
	};

	return (
		<div>
			<Label htmlFor={name} required>
				{t("forms:labels.trophyModel")}
			</Label>
			<textarea
				id={name}
				className={styles.modelTextarea}
				value={value ?? ""}
				onChange={(e) => handleChange(e.target.value)}
				spellCheck={false}
			/>
			<FormMessage type="info">
				{t("forms:bottomTexts.trophyModel")}
				<a
					href={PICOCAD2_WEB_VIEWER_URL}
					target="_blank"
					rel="noopener noreferrer"
				>
					{" "}
					PicoCAD2 Web Viewer
				</a>
			</FormMessage>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
			{previewModel ? (
				<TrophyContextProvider>
					<div className={styles.previewThemes}>
						{(["light", "dark"] as const).map((theme) => (
							<div
								key={theme}
								className={clsx(styles.previewTheme, `${theme}-preview`)}
							>
								<span className={styles.previewThemeLabel}>
									{t(`trophies:new.form.preview.${theme}`)}
								</span>
								<Trophy
									model={previewModel}
									className={styles.trophyPreview}
									preview
									tier={1}
								/>
								<Trophy model={previewModel} className={styles.trophyPreview} />
							</div>
						))}
					</div>
				</TrophyContextProvider>
			) : null}
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
	const visibleCount = useProgressiveRender(items.length, listKind);

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
				{items.slice(0, visibleCount).map((item) => (
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
	const isAccepted = pending.approvals.length >= TROPHY_APPROVALS_REQUIRED;
	const isReviewed = isDeclined || isAccepted;
	const alreadyApproved = pending.approvals.some(
		(a) => a.userId === currentUserId,
	);

	const handleDelete = () => {
		const formData = new FormData();
		formData.append("_action", "DELETE");
		formData.append("pendingTrophyId", String(pending.id));
		fetcher.submit(formData, { method: "post" });
	};

	const handleApprove = () => {
		const formData = new FormData();
		formData.append("_action", "APPROVE");
		formData.append("pendingTrophyId", String(pending.id));
		fetcher.submit(formData, { method: "post" });
	};

	const [previewOpen, setPreviewOpen] = React.useState(false);

	return (
		<div className={styles.pendingItem}>
			<button
				type="button"
				className={styles.trophyPreviewButton}
				onClick={() => setPreviewOpen(true)}
			>
				<Trophy model={pending.model} preview />
			</button>
			<SendouDialog
				heading={pending.name}
				isOpen={previewOpen}
				onClose={() => setPreviewOpen(false)}
				showCloseButton
			>
				<Trophy model={pending.model} className={styles.trophyPreview} />
			</SendouDialog>
			<div className={styles.pendingMain}>
				<div className={styles.pendingHeader}>
					{pending.target ? (
						<span className={styles.editingBadge}>
							{t("trophies:new.update.editing")}
						</span>
					) : null}
					<span className={styles.pendingName}>{pending.name}</span>
					<span className={styles.pendingMeta}>
						{pending.submitterUsername}
						{pending.organizationName ? ` • ${pending.organizationName}` : ""}
					</span>
				</div>
				{pending.target ? (
					<PendingTrophyDiff pending={pending} target={pending.target} />
				) : null}
				{pending.description ? (
					<div className={styles.pendingDescription}>{pending.description}</div>
				) : null}
				{pending.approvals.length > 0 && !isDeclined ? (
					<div className={styles.accepted}>
						<p>
							{t("trophies:new.pending.approvalProgress", {
								current: pending.approvals.length,
								required: TROPHY_APPROVALS_REQUIRED,
							})}
						</p>
						<p>
							{pending.approvals.some((a) => a.userId === currentUserId)
								? `(${pending.approvals.map((a) => a.username).join(", ")})`
								: ""}
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
								size="small"
								onPress={handleApprove}
								isDisabled={fetcher.state !== "idle" || alreadyApproved}
							>
								{alreadyApproved
									? t("trophies:new.pending.approved")
									: t("trophies:new.pending.approve")}
							</SendouButton>
							<DeclineButton pendingTrophyId={pending.id} />
							<SendouButton
								variant="outlined"
								size="small"
								shape="square"
								icon={<Clipboard size={16} />}
								onPress={() => navigator.clipboard.writeText(pending.model)}
							/>
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

function PendingTrophyDiff({
	pending,
	target,
}: {
	pending: NewTrophyLoaderData["pendingTrophies"][number];
	target: NonNullable<NewTrophyLoaderData["pendingTrophies"][number]["target"]>;
}) {
	const { t } = useTranslation(["trophies", "forms"]);

	const newManagerId = pending.managerId ?? pending.submitterUserId;
	const newManagerName =
		pending.manager?.username ?? pending.submitterUsername ?? "?";

	const fields: Array<{
		label: string;
		oldValue: React.ReactNode;
		newValue: React.ReactNode;
		changed: boolean;
	}> = [
		{
			label: t("forms:labels.trophyName"),
			oldValue: target.name,
			newValue: pending.name,
			changed: target.name !== pending.name,
		},
		{
			label: t("forms:labels.trophyOrganization"),
			oldValue: target.organizationName ?? "—",
			newValue: pending.organizationName ?? "—",
			changed: target.organizationId !== pending.organizationId,
		},
		{
			label: t("forms:labels.trophyManager"),
			oldValue: target.managerUsername ?? "—",
			newValue: newManagerName,
			changed: target.managerId !== newManagerId,
		},
		{
			label: t("forms:labels.trophyModel"),
			oldValue: "-----",
			newValue: "-----",
			changed: target.model !== pending.model,
		},
	];

	const changedFields = fields.filter((field) => field.changed);
	if (changedFields.length === 0) return null;

	return (
		<div className={styles.diffGrid}>
			<div className={styles.diffHeader}>{t("trophies:new.update.before")}</div>
			<div className={styles.diffHeader}>{t("trophies:new.update.after")}</div>
			{changedFields.map((field) => (
				<React.Fragment key={field.label}>
					<div className={styles.diffField}>
						<span className={styles.diffLabel}>{field.label}</span>
						<span className={clsx(styles.diffValue, styles.diffOld)}>
							{field.oldValue}
						</span>
					</div>
					<div className={styles.diffField}>
						<span className={styles.diffLabel}>{field.label}</span>
						<span className={styles.diffValue}>{field.newValue}</span>
					</div>
				</React.Fragment>
			))}
		</div>
	);
}
