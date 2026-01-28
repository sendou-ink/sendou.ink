import { parseDate } from "@internationalized/date";
import { Check, Plus, Search, SquarePen, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { Ability } from "~/components/Ability";
import { AddNewButton } from "~/components/AddNewButton";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Badge } from "~/components/Badge";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouCalendar } from "~/components/elements/Calendar";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { toastQueue } from "~/components/elements/Toast";
import { Flag } from "~/components/Flag";
import { FormMessage } from "~/components/FormMessage";
import {
	ModeImage,
	SpecialWeaponImage,
	StageImage,
	SubWeaponImage,
	TierImage,
	WeaponImage,
} from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { Pagination } from "~/components/Pagination";
import { Placement } from "~/components/Placement";
import { RelativeTime } from "~/components/RelativeTime";
import { Section } from "~/components/Section";
import { SideNav, SideNavLink } from "~/components/SideNav";
import { StageSelect } from "~/components/StageSelect";
import { SubmitButton } from "~/components/SubmitButton";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { Table } from "~/components/Table";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import styles from "../components-showcase.module.css";
import { formFieldsShowcaseSchema } from "../form-examples-schema";

export const SECTIONS = [
	{ title: "Buttons", id: "buttons", component: ButtonsSection },
	{ title: "Alerts", id: "alerts", component: AlertsSection },
	{ title: "Inputs", id: "inputs", component: InputsSection },
	{ title: "Select", id: "select", component: SelectSection },
	{ title: "Switch", id: "switch", component: SwitchSection },
	{ title: "Checkboxes", id: "checkboxes", component: CheckboxSection },
	{
		title: "Radio Buttons",
		id: "radio-buttons",
		component: RadioButtonSection,
	},
	{ title: "Fieldsets", id: "fieldsets", component: FieldsetSection },
	{ title: "Details", id: "details", component: DetailsSection },
	{ title: "Tabs", id: "tabs", component: TabsSection },
	{ title: "Dialog", id: "dialog", component: DialogSection },
	{ title: "Popover", id: "popover", component: PopoverSection },
	{ title: "Menu", id: "menu", component: MenuSection },
	{ title: "Toast", id: "toast", component: ToastSection },
	{ title: "Divider", id: "divider", component: DividerSection },
	{ title: "Table", id: "table", component: TableSection },
	{ title: "Pagination", id: "pagination", component: PaginationSection },
	{ title: "Avatar", id: "avatar", component: AvatarSection },
	{
		title: "Form Messages",
		id: "form-messages",
		component: FormMessageSection,
	},
	{ title: "Sub Navigation", id: "sub-navigation", component: SubNavSection },
	{ title: "Date Pickers", id: "date-pickers", component: DatePickerSection },
	{
		title: "Splatoon Images",
		id: "splatoon-images",
		component: SplatoonImagesSection,
	},
	{ title: "Abilities", id: "abilities", component: AbilitySection },
	{ title: "Flags", id: "flags", component: FlagSection },
	{ title: "Placements", id: "placements", component: PlacementSection },
	{ title: "Badges", id: "badges", component: BadgeSection },
	{ title: "Game Selects", id: "game-selects", component: GameSelectSection },
	{ title: "Form Fields", id: "form-fields", component: FormFieldsSection },
	{ title: "Miscellaneous", id: "miscellaneous", component: MiscSection },
] as const;

export default function ComponentsShowcasePage() {
	return (
		<Main className="stack lg" sideNav={<ComponentsSideNav />}>
			<h1>Components</h1>
			{SECTIONS.map(({ id, component: Component }) => (
				<Component key={id} id={id} />
			))}
		</Main>
	);
}

function ComponentsSideNav() {
	const [activeSection, setActiveSection] = useState<string | null>(null);

	useEffect(() => {
		const sectionIds = SECTIONS.map((s) => s.id);
		const elements = sectionIds
			.map((id) => document.getElementById(id))
			.filter(Boolean) as HTMLElement[];

		const observer = new IntersectionObserver(
			(entries) => {
				const visibleEntries = entries.filter((entry) => entry.isIntersecting);

				if (visibleEntries.length > 0) {
					const topMostEntry = visibleEntries.reduce((prev, curr) =>
						prev.boundingClientRect.top < curr.boundingClientRect.top
							? prev
							: curr,
					);

					setActiveSection(topMostEntry.target.id);
				}
			},
			{ rootMargin: "-10% 0px -80% 0px", threshold: 0 },
		);

		for (const element of elements) {
			observer.observe(element);
		}

		return () => observer.disconnect();
	}, []);

	const handleClick = (
		event: React.MouseEvent<HTMLAnchorElement>,
		id: string,
	) => {
		event.preventDefault();
		const element = document.getElementById(id);

		if (element) {
			element.scrollIntoView({ behavior: "instant" });
			window.history.replaceState(null, "", `#${id}`);
			setActiveSection(id);
		}
	};

	return (
		<SideNav>
			{SECTIONS.map(({ title, id }) => (
				<SideNavLink
					key={id}
					to={`#${id}`}
					onClick={(e) => handleClick(e, id)}
					isActive={activeSection === id}
				>
					{title}
				</SideNavLink>
			))}
		</SideNav>
	);
}

function SectionTitle({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}) {
	return (
		<h2 id={id} className={styles.sectionTitle}>
			{children}
		</h2>
	);
}

function ComponentRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.componentRow}>
			<div className={styles.componentLabel}>{label}</div>
			<div className={styles.componentContent}>{children}</div>
		</div>
	);
}

function ButtonsSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Buttons</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Primary (default)">
					<SendouButton>Primary Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Success">
					<SendouButton variant="success">Success Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Destructive">
					<SendouButton variant="destructive">Destructive Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Outlined">
					<SendouButton variant="outlined">Outlined Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Outlined Success">
					<SendouButton variant="outlined-success">
						Outlined Success
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Outlined Destructive">
					<SendouButton variant="outlined-destructive">
						Outlined Destructive
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Minimal">
					<SendouButton variant="minimal">Minimal Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Minimal Success">
					<SendouButton variant="minimal-success">Minimal Success</SendouButton>
				</ComponentRow>

				<ComponentRow label="Minimal Destructive">
					<SendouButton variant="minimal-destructive">
						Minimal Destructive
					</SendouButton>
				</ComponentRow>

				<Divider smallText>Sizes</Divider>

				<ComponentRow label="Miniscule">
					<div className="stack horizontal sm">
						<SendouButton size="miniscule">Miniscule</SendouButton>
						<SendouButton size="miniscule" icon={<SquarePen />}>
							With icon
						</SendouButton>
					</div>
				</ComponentRow>

				<ComponentRow label="Small">
					<div className="stack horizontal sm">
						<SendouButton size="small">Small</SendouButton>
						<SendouButton size="small" icon={<SquarePen />}>
							With icon
						</SendouButton>
					</div>
				</ComponentRow>

				<ComponentRow label="Medium (default)">
					<div className="stack horizontal sm">
						<SendouButton size="medium">Medium</SendouButton>
						<SendouButton size="medium" icon={<SquarePen />}>
							With icon
						</SendouButton>
					</div>
				</ComponentRow>

				<ComponentRow label="Big">
					<div className="stack horizontal sm">
						<SendouButton size="big">Big</SendouButton>
						<SendouButton size="big" icon={<SquarePen />}>
							With icon
						</SendouButton>
					</div>
				</ComponentRow>

				<Divider smallText>Shapes</Divider>

				<ComponentRow label="Circle">
					<div className="stack horizontal sm items-center">
						<SendouButton shape="circle" size="big" icon={<SquarePen />} />
						<SendouButton shape="circle" icon={<SquarePen />} />
						<SendouButton shape="circle" size="small" icon={<SquarePen />} />
						<SendouButton
							shape="circle"
							size="miniscule"
							icon={<SquarePen />}
						/>
					</div>
				</ComponentRow>

				<ComponentRow label="Square">
					<div className="stack horizontal sm items-center">
						<SendouButton shape="square" size="big" icon={<SquarePen />} />
						<SendouButton shape="square" icon={<SquarePen />} />
						<SendouButton shape="square" size="small" icon={<SquarePen />} />
						<SendouButton
							shape="square"
							size="miniscule"
							icon={<SquarePen />}
						/>
					</div>
				</ComponentRow>

				<Divider smallText>With Icons</Divider>

				<ComponentRow label="Icon + Text">
					<SendouButton icon={<Plus />}>Add Item</SendouButton>
				</ComponentRow>

				<ComponentRow label="Icon Only">
					<SendouButton icon={<SquarePen />} />
				</ComponentRow>

				<ComponentRow label="Destructive with Icon">
					<SendouButton variant="destructive" icon={<Trash />}>
						Delete
					</SendouButton>
				</ComponentRow>

				<Divider smallText>States</Divider>

				<ComponentRow label="Disabled">
					<SendouButton isDisabled>Disabled Button</SendouButton>
				</ComponentRow>

				<Divider smallText>Link Buttons</Divider>

				<ComponentRow label="Internal Link">
					<LinkButton to="/">Go to Home</LinkButton>
				</ComponentRow>

				<ComponentRow label="External Link">
					<LinkButton to="https://github.com" isExternal>
						GitHub
					</LinkButton>
				</ComponentRow>

				<Divider smallText>Submit Button</Divider>

				<ComponentRow label="Submit Button">
					<SubmitButton>Submit Form</SubmitButton>
				</ComponentRow>
			</div>
		</Section>
	);
}

function AlertsSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Alerts</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Info (default)">
					<Alert>This is an informational alert message.</Alert>
				</ComponentRow>

				<ComponentRow label="Warning">
					<Alert variation="WARNING">
						This is a warning alert. Please be careful!
					</Alert>
				</ComponentRow>

				<ComponentRow label="Error">
					<Alert variation="ERROR">
						This is an error alert. Something went wrong.
					</Alert>
				</ComponentRow>

				<ComponentRow label="Success">
					<Alert variation="SUCCESS">
						This is a success alert. Operation completed!
					</Alert>
				</ComponentRow>

				<ComponentRow label="Tiny">
					<Alert tiny>This is a tiny alert message.</Alert>
				</ComponentRow>
			</div>
		</Section>
	);
}

function InputsSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Inputs</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Input">
					<Input placeholder="Enter text..." aria-label="Basic input" />
				</ComponentRow>

				<ComponentRow label="With Left Addon">
					<Input leftAddon="@" placeholder="username" aria-label="Username" />
				</ComponentRow>

				<ComponentRow label="With Icon">
					<Input
						icon={<Search />}
						placeholder="Search..."
						aria-label="Search"
					/>
				</ComponentRow>

				<ComponentRow label="Number Type">
					<Input type="number" min={0} max={100} aria-label="Number input" />
				</ComponentRow>

				<ComponentRow label="Date Type">
					<Input type="date" aria-label="Date input" />
				</ComponentRow>

				<ComponentRow label="Read Only">
					<Input
						readOnly
						defaultValue="Read only value"
						aria-label="Read only"
					/>
				</ComponentRow>

				<ComponentRow label="Textarea">
					<textarea placeholder="Enter text..." aria-label="Textarea" />
				</ComponentRow>

				<Divider smallText>Labels</Divider>

				<ComponentRow label="With Label">
					<div>
						<Label htmlFor="labeled-input">Input Label</Label>
						<Input id="labeled-input" placeholder="Labeled input" />
					</div>
				</ComponentRow>

				<ComponentRow label="Required Label">
					<div>
						<Label htmlFor="required-input" required>
							Required Field
						</Label>
						<Input id="required-input" required placeholder="Required input" />
					</div>
				</ComponentRow>

				<ComponentRow label="With Value Limits">
					<div>
						<Label
							htmlFor="limited-input"
							valueLimits={{ current: 15, max: 50 }}
						>
							Limited Field
						</Label>
						<Input
							id="limited-input"
							maxLength={50}
							defaultValue="Sample text"
						/>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

const SELECT_ITEMS = [
	{ id: "1", name: "Option 1" },
	{ id: "2", name: "Option 2" },
	{ id: "3", name: "Option 3" },
	{ id: "4", name: "Option 4" },
	{ id: "5", name: "Option 5" },
];

function SelectSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Select</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Select">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Choose an option"
						placeholder="Select..."
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="With Search">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Searchable Select"
						placeholder="Select..."
						search={{ placeholder: "Search options..." }}
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="Clearable">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Clearable Select"
						placeholder="Select..."
						clearable
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="With Description">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Select with description"
						description="This is a helpful description"
						placeholder="Select..."
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="With Error">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Select with error"
						errorText="This field is required"
						placeholder="Select..."
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="Disabled">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Disabled Select"
						placeholder="Select..."
						isDisabled
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="HTML Select">
					<select>
						{SELECT_ITEMS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</ComponentRow>
			</div>
		</Section>
	);
}

function SwitchSection({ id }: { id: string }) {
	const [isOn, setIsOn] = useState(false);

	return (
		<Section>
			<SectionTitle id={id}>Switch</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Medium (default)">
					<SendouSwitch isSelected={isOn} onChange={setIsOn}>
						Toggle me
					</SendouSwitch>
				</ComponentRow>

				<ComponentRow label="Without Label">
					<SendouSwitch aria-label="Toggle without label" />
				</ComponentRow>

				<ComponentRow label="Disabled">
					<SendouSwitch isDisabled>Disabled switch</SendouSwitch>
				</ComponentRow>
			</div>
		</Section>
	);
}

function CheckboxSection({ id }: { id: string }) {
	const [singleChecked, setSingleChecked] = useState(false);
	const [checkedItems, setCheckedItems] = useState({
		option1: true,
		option2: false,
		option3: true,
	});

	return (
		<Section>
			<SectionTitle id={id}>Checkboxes</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Single Checkbox">
					<label className="stack horizontal sm items-center">
						<input
							type="checkbox"
							checked={singleChecked}
							onChange={(e) => setSingleChecked(e.target.checked)}
						/>
						<span>Accept terms and conditions</span>
					</label>
				</ComponentRow>

				<ComponentRow label="Checkbox Group">
					<div className="stack sm">
						<label className="stack horizontal sm items-center">
							<input
								type="checkbox"
								checked={checkedItems.option1}
								onChange={(e) =>
									setCheckedItems((prev) => ({
										...prev,
										option1: e.target.checked,
									}))
								}
							/>
							<span>Option 1</span>
						</label>
						<label className="stack horizontal sm items-center">
							<input
								type="checkbox"
								checked={checkedItems.option2}
								onChange={(e) =>
									setCheckedItems((prev) => ({
										...prev,
										option2: e.target.checked,
									}))
								}
							/>
							<span>Option 2</span>
						</label>
						<label className="stack horizontal sm items-center">
							<input
								type="checkbox"
								checked={checkedItems.option3}
								onChange={(e) =>
									setCheckedItems((prev) => ({
										...prev,
										option3: e.target.checked,
									}))
								}
							/>
							<span>Option 3</span>
						</label>
					</div>
				</ComponentRow>

				<ComponentRow label="Disabled Checkbox">
					<label className="stack horizontal sm items-center">
						<input type="checkbox" disabled />
						<span>Disabled option</span>
					</label>
				</ComponentRow>

				<ComponentRow label="Disabled Checked">
					<label className="stack horizontal sm items-center">
						<input type="checkbox" disabled checked />
						<span>Disabled but checked</span>
					</label>
				</ComponentRow>

				<ComponentRow label="Indeterminate">
					<label className="stack horizontal sm items-center">
						<input
							type="checkbox"
							ref={(el) => {
								if (el) el.indeterminate = true;
							}}
						/>
						<span>Indeterminate state</span>
					</label>
				</ComponentRow>
			</div>
		</Section>
	);
}

function RadioButtonSection({ id }: { id: string }) {
	const [selectedOption, setSelectedOption] = useState("option2");
	const [selectedSize, setSelectedSize] = useState("medium");

	return (
		<Section>
			<SectionTitle id={id}>Radio Buttons</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Radio Group">
					<div className="stack sm">
						<label className="stack horizontal sm items-center">
							<input
								type="radio"
								name="options"
								value="option1"
								checked={selectedOption === "option1"}
								onChange={(e) => setSelectedOption(e.target.value)}
							/>
							<span>Option 1</span>
						</label>
						<label className="stack horizontal sm items-center">
							<input
								type="radio"
								name="options"
								value="option2"
								checked={selectedOption === "option2"}
								onChange={(e) => setSelectedOption(e.target.value)}
							/>
							<span>Option 2</span>
						</label>
						<label className="stack horizontal sm items-center">
							<input
								type="radio"
								name="options"
								value="option3"
								checked={selectedOption === "option3"}
								onChange={(e) => setSelectedOption(e.target.value)}
							/>
							<span>Option 3</span>
						</label>
					</div>
				</ComponentRow>

				<ComponentRow label="With Descriptions">
					<div className="stack sm">
						<label className="stack horizontal sm items-start">
							<input
								type="radio"
								name="size"
								value="small"
								checked={selectedSize === "small"}
								onChange={(e) => setSelectedSize(e.target.value)}
							/>
							<div className="stack xs">
								<span>Small</span>
								<span style={{ fontSize: "0.875rem", opacity: 0.7 }}>
									Compact size, suitable for limited space
								</span>
							</div>
						</label>
						<label className="stack horizontal sm items-start">
							<input
								type="radio"
								name="size"
								value="medium"
								checked={selectedSize === "medium"}
								onChange={(e) => setSelectedSize(e.target.value)}
							/>
							<div className="stack xs">
								<span>Medium</span>
								<span style={{ fontSize: "0.875rem", opacity: 0.7 }}>
									Default size, balanced for most use cases
								</span>
							</div>
						</label>
						<label className="stack horizontal sm items-start">
							<input
								type="radio"
								name="size"
								value="large"
								checked={selectedSize === "large"}
								onChange={(e) => setSelectedSize(e.target.value)}
							/>
							<div className="stack xs">
								<span>Large</span>
								<span style={{ fontSize: "0.875rem", opacity: 0.7 }}>
									Spacious size, best for emphasis
								</span>
							</div>
						</label>
					</div>
				</ComponentRow>

				<ComponentRow label="Disabled Options">
					<div className="stack sm">
						<label className="stack horizontal sm items-center">
							<input type="radio" name="disabled-group" value="enabled" />
							<span>Enabled option</span>
						</label>
						<label className="stack horizontal sm items-center">
							<input
								type="radio"
								name="disabled-group"
								value="disabled"
								disabled
							/>
							<span>Disabled option</span>
						</label>
						<label className="stack horizontal sm items-center">
							<input
								type="radio"
								name="disabled-group"
								value="disabled-checked"
								disabled
								checked
							/>
							<span>Disabled and checked</span>
						</label>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function FieldsetSection({ id }: { id: string }) {
	const [favoriteColor, setFavoriteColor] = useState("");
	const [notifications, setNotifications] = useState({
		email: true,
		push: false,
		sms: false,
	});

	return (
		<Section>
			<SectionTitle id={id}>Fieldsets</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Fieldset">
					<fieldset
						style={{ padding: "1rem", border: "1px solid var(--gray)" }}
					>
						<legend>Personal Information</legend>
						<div className="stack sm">
							<div>
								<Label htmlFor="fieldset-name">Name</Label>
								<Input id="fieldset-name" placeholder="Enter your name" />
							</div>
							<div>
								<Label htmlFor="fieldset-email">Email</Label>
								<input
									id="fieldset-email"
									type="email"
									placeholder="Enter your email"
								/>
							</div>
						</div>
					</fieldset>
				</ComponentRow>

				<ComponentRow label="Radio Group in Fieldset">
					<fieldset
						style={{ padding: "1rem", border: "1px solid var(--gray)" }}
					>
						<legend>Favorite Color</legend>
						<div className="stack sm">
							<label className="stack horizontal sm items-center">
								<input
									type="radio"
									name="color"
									value="red"
									checked={favoriteColor === "red"}
									onChange={(e) => setFavoriteColor(e.target.value)}
								/>
								<span>Red</span>
							</label>
							<label className="stack horizontal sm items-center">
								<input
									type="radio"
									name="color"
									value="blue"
									checked={favoriteColor === "blue"}
									onChange={(e) => setFavoriteColor(e.target.value)}
								/>
								<span>Blue</span>
							</label>
							<label className="stack horizontal sm items-center">
								<input
									type="radio"
									name="color"
									value="green"
									checked={favoriteColor === "green"}
									onChange={(e) => setFavoriteColor(e.target.value)}
								/>
								<span>Green</span>
							</label>
						</div>
					</fieldset>
				</ComponentRow>

				<ComponentRow label="Checkbox Group in Fieldset">
					<fieldset
						style={{ padding: "1rem", border: "1px solid var(--gray)" }}
					>
						<legend>Notification Preferences</legend>
						<div className="stack sm">
							<label className="stack horizontal sm items-center">
								<input
									type="checkbox"
									checked={notifications.email}
									onChange={(e) =>
										setNotifications((prev) => ({
											...prev,
											email: e.target.checked,
										}))
									}
								/>
								<span>Email notifications</span>
							</label>
							<label className="stack horizontal sm items-center">
								<input
									type="checkbox"
									checked={notifications.push}
									onChange={(e) =>
										setNotifications((prev) => ({
											...prev,
											push: e.target.checked,
										}))
									}
								/>
								<span>Push notifications</span>
							</label>
							<label className="stack horizontal sm items-center">
								<input
									type="checkbox"
									checked={notifications.sms}
									onChange={(e) =>
										setNotifications((prev) => ({
											...prev,
											sms: e.target.checked,
										}))
									}
								/>
								<span>SMS notifications</span>
							</label>
						</div>
					</fieldset>
				</ComponentRow>

				<ComponentRow label="Disabled Fieldset">
					<fieldset
						disabled
						style={{ padding: "1rem", border: "1px solid var(--gray)" }}
					>
						<legend>Disabled Form</legend>
						<div className="stack sm">
							<div>
								<Label htmlFor="disabled-input">Input</Label>
								<Input id="disabled-input" placeholder="This is disabled" />
							</div>
							<label className="stack horizontal sm items-center">
								<input type="checkbox" />
								<span>Checkbox in disabled fieldset</span>
							</label>
							<SendouButton>Button in disabled fieldset</SendouButton>
						</div>
					</fieldset>
				</ComponentRow>
			</div>
		</Section>
	);
}

function DetailsSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Details/Summary</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Details">
					<details>
						<summary>Click to expand</summary>
						<p style={{ padding: "1rem 0" }}>
							This is the hidden content that appears when you expand the
							details element. It can contain any HTML content.
						</p>
					</details>
				</ComponentRow>

				<ComponentRow label="Open by Default">
					<details open>
						<summary>This is open by default</summary>
						<p style={{ padding: "1rem 0" }}>
							The details element can be open by default using the "open"
							attribute.
						</p>
					</details>
				</ComponentRow>

				<ComponentRow label="With Complex Content">
					<details>
						<summary>Advanced Settings</summary>
						<div className="stack sm" style={{ padding: "1rem 0" }}>
							<div>
								<Label htmlFor="setting1">Setting 1</Label>
								<Input id="setting1" placeholder="Enter value" />
							</div>
							<div>
								<Label htmlFor="setting2">Setting 2</Label>
								<SendouSelect
									items={SELECT_ITEMS}
									label="Choose option"
									placeholder="Select..."
								>
									{(item) => (
										<SendouSelectItem key={item.id} id={item.id}>
											{item.name}
										</SendouSelectItem>
									)}
								</SendouSelect>
							</div>
							<label className="stack horizontal sm items-center">
								<input type="checkbox" />
								<span>Enable advanced mode</span>
							</label>
						</div>
					</details>
				</ComponentRow>

				<ComponentRow label="Nested Details">
					<details>
						<summary>Section 1</summary>
						<div style={{ padding: "1rem 0" }}>
							<p>Content for section 1.</p>
							<details style={{ marginTop: "0.5rem" }}>
								<summary>Subsection 1.1</summary>
								<p style={{ padding: "0.5rem 0" }}>
									Nested content in subsection 1.1
								</p>
							</details>
							<details style={{ marginTop: "0.5rem" }}>
								<summary>Subsection 1.2</summary>
								<p style={{ padding: "0.5rem 0" }}>
									Nested content in subsection 1.2
								</p>
							</details>
						</div>
					</details>
				</ComponentRow>

				<ComponentRow label="Stacked Details">
					<div className="stack sm">
						<details>
							<summary>What is this component showcase?</summary>
							<p style={{ padding: "0.5rem 0" }}>
								This is a showcase of various HTML and custom components used in
								the application.
							</p>
						</details>
						<details>
							<summary>How do I use these components?</summary>
							<p style={{ padding: "0.5rem 0" }}>
								Each component has examples showing different variations and use
								cases.
							</p>
						</details>
						<details>
							<summary>Can I customize the styles?</summary>
							<p style={{ padding: "0.5rem 0" }}>
								Yes, most components support custom styling through CSS modules
								and className props.
							</p>
						</details>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function TabsSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Tabs</SectionTitle>

			<div className="stack lg">
				<ComponentRow label="Basic Tabs">
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="tab1">First Tab</SendouTab>
							<SendouTab id="tab2">Second Tab</SendouTab>
							<SendouTab id="tab3">Third Tab</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="tab1">
							Content for the first tab.
						</SendouTabPanel>
						<SendouTabPanel id="tab2">
							Content for the second tab.
						</SendouTabPanel>
						<SendouTabPanel id="tab3">
							Content for the third tab.
						</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>

				<ComponentRow label="With Icons">
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="search" icon={<Search />}>
								Search
							</SendouTab>
							<SendouTab id="edit" icon={<SquarePen />}>
								Edit
							</SendouTab>
							<SendouTab id="check" icon={<Check />}>
								Review
							</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="search">Search content here.</SendouTabPanel>
						<SendouTabPanel id="edit">Edit content here.</SendouTabPanel>
						<SendouTabPanel id="check">Review content here.</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>

				<ComponentRow label="With Numbers">
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="pending" number={5}>
								Pending
							</SendouTab>
							<SendouTab id="approved" number={12}>
								Approved
							</SendouTab>
							<SendouTab id="rejected" number={0}>
								Rejected
							</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="pending">5 pending items.</SendouTabPanel>
						<SendouTabPanel id="approved">12 approved items.</SendouTabPanel>
						<SendouTabPanel id="rejected">No rejected items.</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>

				<ComponentRow label="Full Width">
					<SendouTabs>
						<SendouTabList fullWidth>
							<SendouTab id="build1">Build 1</SendouTab>
							<SendouTab id="build2">Build 2</SendouTab>
							<SendouTab id="compare">Compare</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="build1">Build 1 content.</SendouTabPanel>
						<SendouTabPanel id="build2">Build 2 content.</SendouTabPanel>
						<SendouTabPanel id="compare">Comparison content.</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>
			</div>
		</Section>
	);
}

function DialogSection({ id }: { id: string }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Section>
			<SectionTitle id={id}>Dialog</SectionTitle>

			<div className="stack md">
				<ComponentRow label="With Trigger">
					<SendouDialog
						trigger={<SendouButton>Open Dialog</SendouButton>}
						heading="Dialog Title"
					>
						<p>This is the content of the dialog.</p>
						<p>
							You can put any content here, including forms, lists, or other
							components.
						</p>
					</SendouDialog>
				</ComponentRow>

				<ComponentRow label="Controlled">
					<div className="stack horizontal sm">
						<SendouButton onPress={() => setIsOpen(true)}>
							Open Controlled Dialog
						</SendouButton>
						<SendouDialog
							isOpen={isOpen}
							onClose={() => setIsOpen(false)}
							heading="Controlled Dialog"
							showCloseButton
						>
							<p>This dialog is controlled via state.</p>
							<SendouButton onPress={() => setIsOpen(false)}>
								Close
							</SendouButton>
						</SendouDialog>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function PopoverSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Popover</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Popover">
					<SendouPopover
						trigger={<SendouButton>Click for Popover</SendouButton>}
					>
						<p>This is popover content!</p>
					</SendouPopover>
				</ComponentRow>

				<ComponentRow label="Info Popover">
					<div className="stack horizontal sm items-center">
						<span>Some text with help</span>
						<InfoPopover>
							This is additional information shown in a popover.
						</InfoPopover>
					</div>
				</ComponentRow>

				<ComponentRow label="Tiny Info Popover">
					<div className="stack horizontal sm items-center">
						<span>Compact help icon</span>
						<InfoPopover tiny>Tiny popover with less padding.</InfoPopover>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function MenuSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Menu</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Menu">
					<SendouMenu trigger={<SendouButton>Open Menu</SendouButton>}>
						<SendouMenuItem onAction={() => {}}>Menu Item 1</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Menu Item 2</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Menu Item 3</SendouMenuItem>
					</SendouMenu>
				</ComponentRow>

				<ComponentRow label="With Icons">
					<SendouMenu trigger={<SendouButton>Menu with Icons</SendouButton>}>
						<SendouMenuItem icon={<SquarePen />} onAction={() => {}}>
							Edit
						</SendouMenuItem>
						<SendouMenuItem icon={<Plus />} onAction={() => {}}>
							Add New
						</SendouMenuItem>
						<SendouMenuItem icon={<Trash />} onAction={() => {}}>
							Delete
						</SendouMenuItem>
					</SendouMenu>
				</ComponentRow>

				<ComponentRow label="With Active Item">
					<SendouMenu trigger={<SendouButton>Menu with Active</SendouButton>}>
						<SendouMenuItem isActive onAction={() => {}}>
							Active Item
						</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Normal Item</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Another Item</SendouMenuItem>
					</SendouMenu>
				</ComponentRow>

				<ComponentRow label="Scrolling Menu">
					<SendouMenu
						scrolling
						trigger={<SendouButton>Scrolling Menu</SendouButton>}
					>
						{Array.from({ length: 10 }, (_, i) => (
							<SendouMenuItem key={i} onAction={() => {}}>
								Item {i + 1}
							</SendouMenuItem>
						))}
					</SendouMenu>
				</ComponentRow>
			</div>
		</Section>
	);
}

function ToastSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Toast</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Success Toast">
					<SendouButton
						variant="success"
						onPress={() =>
							toastQueue.add({
								message: "Operation completed successfully!",
								variant: "success",
							})
						}
					>
						Show Success Toast
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Error Toast">
					<SendouButton
						variant="destructive"
						onPress={() =>
							toastQueue.add({
								message: "Something went wrong. Please try again.",
								variant: "error",
							})
						}
					>
						Show Error Toast
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Info Toast">
					<SendouButton
						onPress={() =>
							toastQueue.add({
								message: "Here is some information for you.",
								variant: "info",
							})
						}
					>
						Show Info Toast
					</SendouButton>
				</ComponentRow>
			</div>
		</Section>
	);
}

function DividerSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Divider</SectionTitle>

			<div className="stack lg">
				<ComponentRow label="Basic Divider">
					<div className="stack sm" style={{ width: "100%" }}>
						<p>Content above</p>
						<Divider />
						<p>Content below</p>
					</div>
				</ComponentRow>

				<ComponentRow label="With Text">
					<div className="stack sm" style={{ width: "100%" }}>
						<p>Section 1</p>
						<Divider>OR</Divider>
						<p>Section 2</p>
					</div>
				</ComponentRow>

				<ComponentRow label="Small Text">
					<div className="stack sm" style={{ width: "100%" }}>
						<p>Above</p>
						<Divider smallText>small text divider</Divider>
						<p>Below</p>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function TableSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Table</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Table">
					<Table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Role</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>John Doe</td>
								<td>Developer</td>
								<td>Active</td>
							</tr>
							<tr>
								<td>Jane Smith</td>
								<td>Designer</td>
								<td>Active</td>
							</tr>
							<tr>
								<td>Bob Johnson</td>
								<td>Manager</td>
								<td>Inactive</td>
							</tr>
						</tbody>
					</Table>
				</ComponentRow>

				<ComponentRow label="Table with Actions">
					<Table>
						<thead>
							<tr>
								<th>Item</th>
								<th>Price</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Product A</td>
								<td>$19.99</td>
								<td>
									<div className="stack horizontal xs">
										<SendouButton size="miniscule" icon={<SquarePen />} />
										<SendouButton
											size="miniscule"
											variant="destructive"
											icon={<Trash />}
										/>
									</div>
								</td>
							</tr>
							<tr>
								<td>Product B</td>
								<td>$29.99</td>
								<td>
									<div className="stack horizontal xs">
										<SendouButton size="miniscule" icon={<SquarePen />} />
										<SendouButton
											size="miniscule"
											variant="destructive"
											icon={<Trash />}
										/>
									</div>
								</td>
							</tr>
						</tbody>
					</Table>
				</ComponentRow>
			</div>
		</Section>
	);
}

function PaginationSection({ id }: { id: string }) {
	const [currentPage, setCurrentPage] = useState(5);
	const pagesCount = 50;

	return (
		<Section>
			<SectionTitle id={id}>Pagination</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Pagination">
					<Pagination
						currentPage={currentPage}
						pagesCount={pagesCount}
						nextPage={() => setCurrentPage((p) => Math.min(p + 1, pagesCount))}
						previousPage={() => setCurrentPage((p) => Math.max(p - 1, 1))}
						setPage={setCurrentPage}
					/>
				</ComponentRow>

				<ComponentRow label="At First Page">
					<Pagination
						currentPage={1}
						pagesCount={5}
						nextPage={() => {}}
						previousPage={() => {}}
						setPage={() => {}}
					/>
				</ComponentRow>

				<ComponentRow label="At Last Page">
					<Pagination
						currentPage={5}
						pagesCount={5}
						nextPage={() => {}}
						previousPage={() => {}}
						setPage={() => {}}
					/>
				</ComponentRow>
			</div>
		</Section>
	);
}

function AvatarSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Avatar</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Size xxxs">
					<Avatar
						user={{ discordId: "1", discordAvatar: null }}
						size="xxxs"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size xxxsm">
					<Avatar
						user={{ discordId: "22", discordAvatar: null }}
						size="xxxsm"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size xxs">
					<Avatar
						user={{ discordId: "333", discordAvatar: null }}
						size="xxs"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size xs">
					<Avatar
						user={{ discordId: "4444", discordAvatar: null }}
						size="xs"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size sm (default)">
					<Avatar
						user={{ discordId: "55555", discordAvatar: null }}
						size="sm"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size xsm">
					<Avatar
						user={{ discordId: "123456", discordAvatar: null }}
						size="xsm"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size md">
					<Avatar
						user={{ discordId: "313762200286396416", discordAvatar: null }}
						size="md"
						alt="User avatar"
					/>
				</ComponentRow>

				<ComponentRow label="Size lg">
					<Avatar
						user={{ discordId: "79237403620945920", discordAvatar: null }}
						size="lg"
						alt="User avatar"
					/>
				</ComponentRow>
			</div>
		</Section>
	);
}

function FormMessageSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Form Messages</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Error Message">
					<FormMessage type="error">
						This field is required. Please enter a value.
					</FormMessage>
				</ComponentRow>

				<ComponentRow label="Info Message">
					<FormMessage type="info">
						This is an informational message to help you.
					</FormMessage>
				</ComponentRow>

				<ComponentRow label="With Input">
					<div>
						<Label htmlFor="message-demo">Email</Label>
						<input id="message-demo" type="email" placeholder="Enter email" />
						<FormMessage type="error">
							Please enter a valid email address.
						</FormMessage>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function SubNavSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Sub Navigation</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Primary SubNav">
					<SubNav>
						<SubNavLink to="#overview" controlled active>
							Overview
						</SubNavLink>
						<SubNavLink to="#details" controlled>
							Details
						</SubNavLink>
						<SubNavLink to="#settings" controlled>
							Settings
						</SubNavLink>
					</SubNav>
				</ComponentRow>

				<ComponentRow label="Secondary SubNav">
					<SubNav secondary>
						<SubNavLink to="#tab1" secondary controlled active>
							Tab 1
						</SubNavLink>
						<SubNavLink to="#tab2" secondary controlled>
							Tab 2
						</SubNavLink>
						<SubNavLink to="#tab3" secondary controlled>
							Tab 3
						</SubNavLink>
					</SubNav>
				</ComponentRow>

				<ComponentRow label="AddNewButton">
					<AddNewButton to="/new" navIcon="calendar" />
				</ComponentRow>
			</div>
		</Section>
	);
}

function DatePickerSection({ id }: { id: string }) {
	const [calendarValue, setCalendarValue] = useState(parseDate("2024-12-27"));
	const [datePickerValue, setDatePickerValue] = useState(
		parseDate("2024-12-27"),
	);

	const handleCalendarChange = (value: typeof calendarValue | null) => {
		if (value) setCalendarValue(value);
	};

	const handleDatePickerChange = (value: typeof datePickerValue | null) => {
		if (value) setDatePickerValue(value);
	};

	return (
		<Section>
			<SectionTitle id={id}>Date Pickers</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Calendar">
					<SendouCalendar
						value={calendarValue}
						onChange={handleCalendarChange}
					/>
				</ComponentRow>

				<ComponentRow label="DatePicker">
					<SendouDatePicker
						label="Select Date"
						value={datePickerValue}
						onChange={handleDatePickerChange}
					/>
				</ComponentRow>

				<ComponentRow label="DatePicker with Bottom Text">
					<SendouDatePicker
						label="Event Date"
						value={datePickerValue}
						onChange={handleDatePickerChange}
						bottomText="Choose the date for your event"
					/>
				</ComponentRow>

				<ComponentRow label="DatePicker Required">
					<SendouDatePicker
						label="Required Date"
						value={datePickerValue}
						onChange={handleDatePickerChange}
						isRequired
					/>
				</ComponentRow>
			</div>
		</Section>
	);
}

function SplatoonImagesSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Splatoon Images</SectionTitle>

			<div className="stack md">
				<ComponentRow label="WeaponImage (build)">
					<div className="stack horizontal sm">
						<WeaponImage weaponSplId={0} variant="build" size={48} />
						<WeaponImage weaponSplId={10} variant="build" size={48} />
						<WeaponImage weaponSplId={40} variant="build" size={48} />
						<WeaponImage weaponSplId={1000} variant="build" size={48} />
						<WeaponImage weaponSplId={2000} variant="build" size={48} />
					</div>
				</ComponentRow>

				<ComponentRow label="WeaponImage (badge)">
					<div className="stack horizontal sm">
						<WeaponImage weaponSplId={0} variant="badge" size={48} />
						<WeaponImage weaponSplId={10} variant="badge" size={48} />
						<WeaponImage weaponSplId={40} variant="badge" size={48} />
						<WeaponImage weaponSplId={1000} variant="badge" size={48} />
						<WeaponImage weaponSplId={2000} variant="badge" size={48} />
					</div>
				</ComponentRow>

				<ComponentRow label="WeaponImage (badge 5-star)">
					<div className="stack horizontal sm">
						<WeaponImage weaponSplId={0} variant="badge-5-star" size={48} />
						<WeaponImage weaponSplId={10} variant="badge-5-star" size={48} />
						<WeaponImage weaponSplId={40} variant="badge-5-star" size={48} />
					</div>
				</ComponentRow>

				<ComponentRow label="SubWeaponImage">
					<div className="stack horizontal sm">
						<SubWeaponImage subWeaponId={0} size={32} />
						<SubWeaponImage subWeaponId={1} size={32} />
						<SubWeaponImage subWeaponId={2} size={32} />
						<SubWeaponImage subWeaponId={3} size={32} />
						<SubWeaponImage subWeaponId={4} size={32} />
					</div>
				</ComponentRow>

				<ComponentRow label="SpecialWeaponImage">
					<div className="stack horizontal sm">
						<SpecialWeaponImage specialWeaponId={1} size={32} />
						<SpecialWeaponImage specialWeaponId={2} size={32} />
						<SpecialWeaponImage specialWeaponId={3} size={32} />
						<SpecialWeaponImage specialWeaponId={4} size={32} />
						<SpecialWeaponImage specialWeaponId={7} size={32} />
					</div>
				</ComponentRow>

				<ComponentRow label="ModeImage">
					<div className="stack horizontal sm">
						<ModeImage mode="TW" size={32} />
						<ModeImage mode="SZ" size={32} />
						<ModeImage mode="TC" size={32} />
						<ModeImage mode="RM" size={32} />
						<ModeImage mode="CB" size={32} />
					</div>
				</ComponentRow>

				<ComponentRow label="StageImage">
					<div className="stack horizontal sm">
						<StageImage stageId={0} width={120} />
						<StageImage stageId={1} width={120} />
						<StageImage stageId={2} width={120} />
					</div>
				</ComponentRow>

				<ComponentRow label="TierImage">
					<div className="stack horizontal sm items-end">
						<TierImage tier={{ name: "LEVIATHAN", isPlus: false }} width={80} />
						<TierImage tier={{ name: "DIAMOND", isPlus: true }} width={80} />
						<TierImage tier={{ name: "GOLD", isPlus: false }} width={80} />
						<TierImage tier={{ name: "SILVER", isPlus: false }} width={80} />
						<TierImage tier={{ name: "BRONZE", isPlus: false }} width={80} />
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function AbilitySection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Abilities</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Main Size">
					<div className="stack horizontal sm">
						<Ability ability="ISM" size="MAIN" />
						<Ability ability="ISS" size="MAIN" />
						<Ability ability="IRU" size="MAIN" />
						<Ability ability="SSU" size="MAIN" />
						<Ability ability="RSU" size="MAIN" />
					</div>
				</ComponentRow>

				<ComponentRow label="Sub Size">
					<div className="stack horizontal sm">
						<Ability ability="ISM" size="SUB" />
						<Ability ability="ISS" size="SUB" />
						<Ability ability="IRU" size="SUB" />
						<Ability ability="SSU" size="SUB" />
						<Ability ability="RSU" size="SUB" />
					</div>
				</ComponentRow>

				<ComponentRow label="Sub Tiny Size">
					<div className="stack horizontal sm">
						<Ability ability="ISM" size="SUBTINY" />
						<Ability ability="ISS" size="SUBTINY" />
						<Ability ability="IRU" size="SUBTINY" />
						<Ability ability="SSU" size="SUBTINY" />
						<Ability ability="RSU" size="SUBTINY" />
					</div>
				</ComponentRow>

				<ComponentRow label="Tiny Size">
					<div className="stack horizontal sm">
						<Ability ability="ISM" size="TINY" />
						<Ability ability="ISS" size="TINY" />
						<Ability ability="IRU" size="TINY" />
						<Ability ability="SSU" size="TINY" />
						<Ability ability="RSU" size="TINY" />
					</div>
				</ComponentRow>

				<ComponentRow label="Unknown Ability">
					<div className="stack horizontal sm">
						<Ability ability="UNKNOWN" size="TINY" />
						<Ability ability="UNKNOWN" size="SUB" />
						<Ability ability="UNKNOWN" size="MAIN" />
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function FlagSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Flags</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Regular Size">
					<div className="stack horizontal sm">
						<Flag countryCode="US" />
						<Flag countryCode="JP" />
						<Flag countryCode="GB" />
						<Flag countryCode="DE" />
						<Flag countryCode="FR" />
						<Flag countryCode="KR" />
						<Flag countryCode="AU" />
						<Flag countryCode="BR" />
					</div>
				</ComponentRow>

				<ComponentRow label="Tiny Size">
					<div className="stack horizontal sm">
						<Flag countryCode="US" tiny />
						<Flag countryCode="JP" tiny />
						<Flag countryCode="GB" tiny />
						<Flag countryCode="DE" tiny />
						<Flag countryCode="FR" tiny />
						<Flag countryCode="KR" tiny />
						<Flag countryCode="AU" tiny />
						<Flag countryCode="BR" tiny />
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function PlacementSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Placements</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Top 3 (with icons)">
					<div className="stack horizontal md items-center">
						<Placement placement={1} />
						<Placement placement={2} />
						<Placement placement={3} />
					</div>
				</ComponentRow>

				<ComponentRow label="Other Placements">
					<div className="stack horizontal md items-center">
						<Placement placement={5} />
						<Placement placement={10} />
						<Placement placement={100} />
					</div>
				</ComponentRow>

				<ComponentRow label="Text Only">
					<div className="stack horizontal md items-center">
						<Placement placement={1} textOnly />
						<Placement placement={2} textOnly />
						<Placement placement={3} textOnly />
					</div>
				</ComponentRow>

				<ComponentRow label="Different Sizes">
					<div className="stack horizontal md items-center">
						<Placement placement={1} size={16} />
						<Placement placement={1} size={24} />
						<Placement placement={1} size={32} />
						<Placement placement={1} size={48} />
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function BadgeSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Badges</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Badge">
					<div className="stack horizontal sm">
						<Badge
							badge={{
								displayName: "Example Badge",
								code: "sundae",
								hue: null,
							}}
							isAnimated={false}
							size={64}
						/>
					</div>
				</ComponentRow>

				<ComponentRow label="With Hue Rotation">
					<div className="stack horizontal sm">
						<Badge
							badge={{ displayName: "Badge 0°", code: "sundae", hue: 0 }}
							isAnimated={false}
							size={48}
						/>
						<Badge
							badge={{ displayName: "Badge 90°", code: "sundae", hue: 90 }}
							isAnimated={false}
							size={48}
						/>
						<Badge
							badge={{ displayName: "Badge 180°", code: "sundae", hue: 180 }}
							isAnimated={false}
							size={48}
						/>
						<Badge
							badge={{ displayName: "Badge 270°", code: "sundae", hue: 270 }}
							isAnimated={false}
							size={48}
						/>
					</div>
				</ComponentRow>

				<ComponentRow label="Different Sizes">
					<div className="stack horizontal sm items-end">
						<Badge
							badge={{ displayName: "Small", code: "sundae", hue: null }}
							isAnimated={false}
							size={32}
						/>
						<Badge
							badge={{ displayName: "Medium", code: "sundae", hue: null }}
							isAnimated={false}
							size={48}
						/>
						<Badge
							badge={{ displayName: "Large", code: "sundae", hue: null }}
							isAnimated={false}
							size={64}
						/>
						<Badge
							badge={{ displayName: "XL", code: "sundae", hue: null }}
							isAnimated={false}
							size={96}
						/>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function GameSelectSection({ id }: { id: string }) {
	const [selectedWeapon, setSelectedWeapon] = useState<MainWeaponId | null>(
		null,
	);
	const [selectedStage, setSelectedStage] = useState<StageId | null>(null);

	return (
		<Section>
			<SectionTitle id={id}>Game Selects</SectionTitle>

			<div className="stack md">
				<ComponentRow label="WeaponSelect">
					<WeaponSelect
						label="Select Weapon"
						value={selectedWeapon}
						onChange={setSelectedWeapon}
						clearable
					/>
				</ComponentRow>

				<ComponentRow label="StageSelect">
					<StageSelect
						label="Select Stage"
						value={selectedStage}
						onChange={setSelectedStage}
						clearable
					/>
				</ComponentRow>

				<ComponentRow label="WeaponSelect Required">
					<WeaponSelect label="Required Weapon" isRequired />
				</ComponentRow>
			</div>
		</Section>
	);
}

const DYNAMIC_SELECT_OPTIONS = [
	{ value: "1", label: "Tournament A" },
	{ value: "2", label: "Tournament B" },
	{ value: "3", label: "Tournament C" },
];

function FormFieldsSection({ id }: { id: string }) {
	return (
		<Section>
			<SectionTitle id={id}>Form Fields</SectionTitle>
			<p className="mb-4" style={{ fontSize: "var(--font-sm)", opacity: 0.8 }}>
				Schema-based form fields using SendouForm. Each field type is defined
				with Zod schemas that generate both UI and validation.
			</p>

			<SendouForm
				schema={formFieldsShowcaseSchema}
				autoSubmit
				className="w-full"
			>
				{({ FormField }) => (
					<div className="stack lg">
						<Divider smallText>Text Fields</Divider>

						<ComponentRow label="textFieldRequired">
							<FormField name="requiredText" />
						</ComponentRow>

						<ComponentRow label="textFieldOptional">
							<FormField name="optionalText" />
						</ComponentRow>

						<ComponentRow label="numberFieldOptional">
							<FormField name="optionalNumber" />
						</ComponentRow>

						<Divider smallText>Text Areas</Divider>

						<ComponentRow label="textAreaRequired">
							<FormField name="requiredTextArea" />
						</ComponentRow>

						<ComponentRow label="textAreaOptional">
							<FormField name="optionalTextArea" />
						</ComponentRow>

						<Divider smallText>Toggle (Switch)</Divider>

						<ComponentRow label="toggle">
							<div className="stack sm">
								<FormField name="isPublic" />
								<FormField name="enableNotifications" />
							</div>
						</ComponentRow>

						<Divider smallText>Select Fields</Divider>

						<ComponentRow label="select (required)">
							<FormField name="requiredSelect" />
						</ComponentRow>

						<ComponentRow label="selectOptional (clearable)">
							<FormField name="optionalSelect" />
						</ComponentRow>

						<ComponentRow label="selectDynamicOptional">
							<FormField
								name="dynamicSelect"
								options={DYNAMIC_SELECT_OPTIONS}
							/>
						</ComponentRow>

						<ComponentRow label="dualSelectOptional">
							<FormField name="divisionRange" />
						</ComponentRow>

						<Divider smallText>Radio & Checkbox Groups</Divider>

						<ComponentRow label="radioGroup">
							<FormField name="matchType" />
						</ComponentRow>

						<ComponentRow label="checkboxGroup">
							<FormField name="selectedModes" />
						</ComponentRow>

						<Divider smallText>Date & Time</Divider>

						<ComponentRow label="datetimeRequired">
							<FormField name="requiredDatetime" />
						</ComponentRow>

						<ComponentRow label="datetimeOptional">
							<FormField name="optionalDatetime" />
						</ComponentRow>

						<ComponentRow label="dayMonthYearRequired">
							<FormField name="birthDate" />
						</ComponentRow>

						<ComponentRow label="timeRangeOptional">
							<FormField name="availableTime" />
						</ComponentRow>

						<Divider smallText>Game-specific Fields</Divider>

						<ComponentRow label="weaponPool">
							<FormField name="weapons" />
						</ComponentRow>

						<ComponentRow label="stageSelect">
							<FormField name="stage" />
						</ComponentRow>

						<ComponentRow label="weaponSelectOptional">
							<FormField name="weapon" />
						</ComponentRow>

						<ComponentRow label="userSearchOptional">
							<FormField name="user" />
						</ComponentRow>

						<Divider smallText>Custom Field</Divider>

						<ComponentRow label="customField">
							<FormField name="customValue">
								{(props: CustomFieldRenderProps) => (
									<div className="stack sm">
										<Label htmlFor="custom-input">Custom Field</Label>
										<Input
											id="custom-input"
											value={(props.value as string) ?? ""}
											onChange={(e) => props.onChange(e.target.value)}
											aria-invalid={Boolean(props.error)}
										/>
										{props.error ? (
											<FormMessage type="error">{props.error}</FormMessage>
										) : null}
									</div>
								)}
							</FormField>
						</ComponentRow>
					</div>
				)}
			</SendouForm>
		</Section>
	);
}

function MiscSection({ id }: { id: string }) {
	const [rangeValue, setRangeValue] = useState(50);
	const [colorValue, setColorValue] = useState("#3b82f6");

	return (
		<Section>
			<SectionTitle id={id}>Miscellaneous</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Section Component">
					<Section title="Section Title" className="stack sm">
						<p>This is content inside a Section component.</p>
						<p>It provides consistent styling for content blocks.</p>
					</Section>
				</ComponentRow>

				<ComponentRow label="Progress Bar">
					<div className="stack sm" style={{ width: "100%" }}>
						<progress value={70} max={100} style={{ width: "100%" }} />
						<progress value={30} max={100} style={{ width: "100%" }} />
					</div>
				</ComponentRow>

				<ComponentRow label="Range Slider">
					<div className="stack sm" style={{ width: "100%" }}>
						<label className="stack horizontal sm items-center">
							<span>Volume: {rangeValue}</span>
						</label>
						<input
							type="range"
							min={0}
							max={100}
							value={rangeValue}
							onChange={(e) => setRangeValue(Number(e.target.value))}
							style={{ width: "100%" }}
						/>
					</div>
				</ComponentRow>

				<ComponentRow label="Color Picker">
					<div className="stack horizontal sm items-center">
						<input
							type="color"
							value={colorValue}
							onChange={(e) => setColorValue(e.target.value)}
						/>
						<span>{colorValue}</span>
					</div>
				</ComponentRow>

				<ComponentRow label="File Input">
					<input type="file" />
				</ComponentRow>

				<ComponentRow label="Multiple File Input">
					<input type="file" multiple />
				</ComponentRow>

				<ComponentRow label="File Input (Accept Images)">
					<input type="file" accept="image/*" />
				</ComponentRow>

				<ComponentRow label="Time Input">
					<input type="time" />
				</ComponentRow>

				<ComponentRow label="Datetime-local Input">
					<input type="datetime-local" />
				</ComponentRow>

				<ComponentRow label="Week Input">
					<input type="week" />
				</ComponentRow>

				<ComponentRow label="Month Input">
					<input type="month" />
				</ComponentRow>

				<ComponentRow label="Email Input">
					<input type="email" placeholder="email@example.com" />
				</ComponentRow>

				<ComponentRow label="URL Input">
					<input type="url" placeholder="https://example.com" />
				</ComponentRow>

				<ComponentRow label="Tel Input">
					<input type="tel" placeholder="+1 (555) 123-4567" />
				</ComponentRow>

				<ComponentRow label="Search Input">
					<input type="search" placeholder="Search..." />
				</ComponentRow>

				<ComponentRow label="Password Input">
					<input type="password" placeholder="Enter password" />
				</ComponentRow>

				<ComponentRow label="HTML Select">
					<select>
						{SELECT_ITEMS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</ComponentRow>

				<ComponentRow label="HTML Tags">
					<div className="stack sm">
						<div>
							<strong>Bold text</strong>
						</div>
						<div>
							<em>Italic text</em>
						</div>
						<div>
							<mark>Highlighted text</mark>
						</div>
						<div>
							<del>Deleted text</del>
						</div>
						<div>
							<ins>Inserted text</ins>
						</div>
						<div>
							<code>Inline code</code>
						</div>
						<div>
							<kbd>Keyboard input</kbd>
						</div>
						<div>
							<samp>Sample output</samp>
						</div>
						<div>
							<var>Variable</var>
						</div>
						<div>
							<small>Small text</small>
						</div>
						<div>
							H<sub>2</sub>O (subscript)
						</div>
						<div>
							E = mc<sup>2</sup> (superscript)
						</div>
						<div>
							<abbr title="HyperText Markup Language">HTML</abbr> (abbreviation)
						</div>
					</div>
				</ComponentRow>

				<ComponentRow label="Lists">
					<div className="stack md">
						<div>
							<strong>Unordered List:</strong>
							<ul>
								<li>Item 1</li>
								<li>Item 2</li>
								<li>
									Item 3
									<ul>
										<li>Nested item 1</li>
										<li>Nested item 2</li>
									</ul>
								</li>
							</ul>
						</div>
						<div>
							<strong>Ordered List:</strong>
							<ol>
								<li>First item</li>
								<li>Second item</li>
								<li>Third item</li>
							</ol>
						</div>
						<div>
							<strong>Description List:</strong>
							<dl>
								<dt>Term 1</dt>
								<dd>Definition for term 1</dd>
								<dt>Term 2</dt>
								<dd>Definition for term 2</dd>
							</dl>
						</div>
					</div>
				</ComponentRow>

				<ComponentRow label="Blockquote">
					<blockquote
						style={{ borderLeft: "4px solid var(--gray)", paddingLeft: "1rem" }}
					>
						<p>
							This is a blockquote. It's used to represent content quoted from
							another source.
						</p>
						<footer>— Author Name</footer>
					</blockquote>
				</ComponentRow>

				<ComponentRow label="Preformatted Text">
					<pre
						style={{
							background: "var(--gray-bg)",
							padding: "1rem",
							overflow: "auto",
						}}
					>
						<code>
							{`function example() {
  const greeting = "Hello, World!";
  console.log(greeting);
  return greeting;
}`}
						</code>
					</pre>
				</ComponentRow>

				<ComponentRow label="Horizontal Rule">
					<div style={{ width: "100%" }}>
						<p>Content above</p>
						<hr />
						<p>Content below</p>
					</div>
				</ComponentRow>

				<ComponentRow label="RelativeTime">
					<RelativeTime timestamp={Date.now() - 3600000}>
						1 hour ago
					</RelativeTime>
				</ComponentRow>

				<ComponentRow label="CopyToClipboardPopover">
					<CopyToClipboardPopover
						trigger={<SendouButton size="small">Share Link</SendouButton>}
						url="https://sendou.ink/example"
					/>
				</ComponentRow>
			</div>
		</Section>
	);
}
