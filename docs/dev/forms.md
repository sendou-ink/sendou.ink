# SendouForm - Schema-Based Form System

This document describes the schema-based form system using `SendouForm`. Forms are defined as Zod schemas that generate both the UI and server-side validation.

## Core Concepts

- Forms are defined as Zod schemas using field builders from `~/form/fields`
- The same schema validates both client-side and server-side
- All translations go in `locales/en/forms.json`
- `FormField` renders the correct UI based on schema metadata

## Schema Definition

### Basic Schema Example

```ts
export const myFormSchema = z.object({
  name: textFieldRequired({
    label: "labels.name",
    maxLength: 100,
  }),
  bio: textAreaOptional({
    label: "labels.bio",
    bottomText: "bottomTexts.bioHelp",
    maxLength: 500,
  }),
  isPublic: toggle({
    label: "labels.isPublic",
  }),
});
```

### Available Field Builders

| Builder | Description | Required Props |
|---------|-------------|----------------|
| `textFieldRequired` | Required text input | `label`, `maxLength` |
| `textFieldOptional` | Optional text input | `maxLength` |
| `numberFieldOptional` | Optional number input | - |
| `textAreaRequired` | Required multiline text | `label`, `maxLength` |
| `textAreaOptional` | Optional multiline text | `maxLength` |
| `toggle` | Boolean switch | `label` |
| `select` | Required dropdown | `label`, `items` |
| `selectOptional` | Optional dropdown (clearable) | `label`, `items` |
| `selectDynamicOptional` | Dropdown with runtime options | `label` |
| `radioGroup` | Radio button group | `label`, `items` |
| `checkboxGroup` | Multiple selection checkboxes | `label`, `items` |
| `datetimeRequired` | Required date/time picker | `label` |
| `datetimeOptional` | Optional date/time picker | `label` |
| `dayMonthYearRequired` | Date picker (day only) | `label` |
| `dualSelectOptional` | Two linked dropdowns | `fields` |
| `timeRangeOptional` | Start/end time range | `label` |
| `weaponPool` | Weapon selection pool | `label`, `maxCount` |
| `stageSelect` | Stage dropdown | `label` |
| `weaponSelectOptional` | Weapon dropdown | `label` |
| `userSearch` | User search autocomplete | `label` |
| `userSearchOptional` | Optional user search | `label` |
| `badges` | Badge selection | `label` |
| `array` | Repeatable field | `field`, `max` |
| `fieldset` | Nested object fields | `fields` |
| `stringConstant` | Hidden string value | value |
| `idConstant` | Hidden numeric ID | value (optional) |
| `customField` | Custom render | `initialValue`, schema |

### Select Items

Select fields require `items` array:

```ts
const typeField = select({
  label: "labels.type",
  items: [
    { label: "options.type.free", value: "FREE" },
    { label: "options.type.paid", value: "PAID" },
  ],
});
```

For dynamic labels (e.g., numbers or translation not needed), use the functional form:

```ts
items: [
  { label: () => "1v1", value: "1" },
  { label: () => "2v2", value: "2" },
]
```

### Action Fields

Define action discriminators with `stringConstant`:

```ts
export const myFormSchema = z.object({
  _action: stringConstant("CREATE_ITEM"),
  name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
});
```

### Constants and Hidden Fields

Use `idConstant` for IDs that need default values:

```ts
export const editFormSchema = z.object({
  itemId: idConstant(), // Requires defaultValues
  name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
});
```

When `idConstant()` is called without a value, the schema requires `defaultValues` prop in `SendouForm`.

### Text Field Validation

```ts
textFieldRequired({
  label: "labels.url",
  maxLength: 200,
  validate: "url", // Built-in URL validation
})

textFieldRequired({
  label: "labels.custom",
  maxLength: 100,
  validate: {
    func: (val) => val.startsWith("https://"),
    message: "Must start with https://",
  },
})

textFieldRequired({
  label: "labels.pattern",
  maxLength: 10,
  regExp: {
    pattern: /^\d{1,2}:\d{2}$/,
    message: "Invalid format",
  },
})
```

### DateTime Validation

```ts
datetimeRequired({
  label: "labels.date",
  min: new Date(),
  max: add(new Date(), { days: 30 }),
  minMessage: "errors.dateInPast",
  maxMessage: "errors.dateTooFarInFuture",
})
```

### Dual Select

```ts
dualSelectOptional({
  fields: [
    {
      label: "labels.maxDiv",
      items: DIVS.map((d) => ({ label: () => d, value: d })),
    },
    {
      label: "labels.minDiv",
      items: DIVS.map((d) => ({ label: () => d, value: d })),
    },
  ],
  validate: {
    func: ([max, min]) => (max && !min) || (!max && min) ? false : true,
    message: "errors.bothOrNeither",
  },
})
```

### Arrays and Fieldsets

```ts
const itemSchema = z.object({
  name: textFieldRequired({ label: "labels.itemName", maxLength: 50 }),
  quantity: numberFieldOptional({ label: "labels.quantity" }),
});

export const formSchema = z.object({
  items: array({
    label: "labels.items",
    min: 1,
    max: 10,
    field: fieldset({ fields: itemSchema }),
  }),
});
```

### Union for Shared Field Definitions

Place field inside `z.union([])` to reuse across multiple schemas:

```ts
const sharedNameField = textFieldRequired({
  label: "labels.name",
  maxLength: 100,
});

const createSchema = z.object({
  _action: stringConstant("CREATE"),
  name: sharedNameField,
});

const editSchema = z.object({
  _action: stringConstant("EDIT"),
  id: idConstant(),
  name: sharedNameField,
});

export const actionSchema = z.union([createSchema, editSchema]);
```

## Component Usage

### Basic Form

```tsx
import { SendouForm } from "~/form/SendouForm";
import { myFormSchema } from "./my-schemas";

function MyForm() {
  return (
    <SendouForm schema={myFormSchema} submitButtonText="Save">
      {({ FormField }) => (
        <>
          <FormField name="name" />
          <FormField name="bio" />
          <FormField name="isPublic" />
        </>
      )}
    </SendouForm>
  );
}
```

### With Default Values

Typically default values are loaded via a loader function

```tsx
const data = useLoaderData<typeof loader>();

<SendouForm
  schema={editFormSchema}
  defaultValues={{
    itemId: data.item.id,
    name: data.item.name,
  }}
>
  {({ FormField }) => (
    <FormField name="name" />
  )}
</SendouForm>
```

### Auto-Submit Forms

```tsx
<SendouForm schema={filterSchema} autoSubmit>
  {({ FormField }) => (
    <FormField name="sortBy" />
  )}
</SendouForm>
```

### Client-Side Only (onApply)

```tsx
<SendouForm
  schema={filtersSchema}
  defaultValues={currentFilters}
  onApply={(values) => {
    setSearchParams({ filters: JSON.stringify(values) });
    closeDialog();
  }}
>
  {({ FormField }) => (
    <FormField name="category" />
  )}
</SendouForm>
```

### Dynamic Select Options

For `selectDynamicOptional`, pass options via the `options` prop:

```tsx
const options = tournaments.map((t) => ({
  value: String(t.id),
  label: t.name,
}));

<FormField name="tournamentId" options={options} />
```

### Badges Field

```tsx
const badgeOptions = badges.map((b) => ({
  id: b.id,
  displayName: b.displayName,
  code: b.code,
  hue: b.hue,
}));

<FormField name="displayBadges" options={badgeOptions} />
```

## Custom Fields

Use `customField` for complex UI that doesn't fit standard field types:

### Schema

```ts
const povSchema = z.union([
  z.object({ type: z.literal("USER"), userId: id.optional() }),
  z.object({ type: z.literal("NAME"), name: z.string().max(100) }),
]);

export const formSchema = z.object({
  pov: customField(
    { initialValue: { type: "USER" as const } },
    povSchema.optional()
  ),
});
```

### Component

```tsx
<FormField name="pov">
  {({ value, onChange, error }) => (
    <MyCustomPovSelector
      value={value}
      onChange={onChange}
      error={error}
    />
  )}
</FormField>
```

### Custom Field Props

```ts
type CustomFieldRenderProps<TValue = unknown> = {
  name: string;
  error: string | undefined;
  value: TValue;
  onChange: (value: TValue) => void;
};
```

## Array Field with Custom Items

```tsx
<FormField name="matches">
  {({ index, itemName, values, setItemField, canRemove, remove }) => (
    <div>
      <FormField name={`${itemName}.startsAt`} />
      <FormField name={`${itemName}.mode`} />

      {/* Custom element within array item */}
      <MyCustomWeaponSelect
        value={values.weapon}
        onChange={(v) => setItemField("weapon", v)}
      />

      {canRemove && (
        <button onClick={remove}>Remove</button>
      )}
    </div>
  )}
</FormField>
```

## Server-Side Validation

### Basic Action Handler

```ts
// IMPORTANT: import path needs to be this exact one
import { parseFormData } from "~/form/parse.server";
import { myFormSchema } from "./my-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await parseFormData({
    request,
    schema: myFormSchema,
  });

  if (!result.success) {
    return { fieldErrors: result.fieldErrors };
  }

  const data = result.data;
  // data is fully typed based on schema

  await doSomething(data);
  return redirect("/success");
};
```

### Server-Only Schema Pattern

When you need async validation (database checks, authorization), create a separate server schema file that extends the base schema.

**Base schema (`feature-schemas.ts`)** - used by both client and server:

```ts
import { z } from "zod";
import { textFieldRequired, idConstantOptional } from "~/form/fields";

// Shared sync validation that can be extracted for reuse
function validateGearAllOrNone(data: {
  head: number | null;
  clothes: number | null;
  shoes: number | null;
}) {
  const gearFilled = [data.head, data.clothes, data.shoes].filter(
    (g) => g !== null,
  );
  return gearFilled.length === 0 || gearFilled.length === 3;
}

// Export refine config for reuse in server schema
export const gearAllOrNoneRefine = {
  fn: validateGearAllOrNone,
  opts: { message: "forms:errors.gearAllOrNone", path: ["head"] },
};

// Base schema with form field builders (for UI generation)
export const newBuildBaseSchema = z.object({
  buildToEditId: idConstantOptional(),
  title: textFieldRequired({ label: "labels.buildTitle", maxLength: 50 }),
  // ... other fields
});

// Client schema with sync refinements only
export const newBuildSchema = newBuildBaseSchema.refine(
  gearAllOrNoneRefine.fn,
  gearAllOrNoneRefine.opts,
);
```

**Server schema (`feature-schemas.server.ts`)** - adds async validation:

```ts
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { gearAllOrNoneRefine, newBuildBaseSchema } from "./feature-schemas";

export const newBuildSchemaServer = newBuildBaseSchema
  // Reuse sync refinements from base
  .refine(gearAllOrNoneRefine.fn, gearAllOrNoneRefine.opts)
  // Add async server-only validation
  .refine(
    async (data) => {
      if (!data.buildToEditId) return true;

      const user = requireUser();
      const ownerId = await BuildRepository.ownerIdById(data.buildToEditId);

      return ownerId === user.id;
    },
    { message: "Not a build you own", path: ["buildToEditId"] },
  );
```

**Action using server schema:**

```ts
import { parseFormData } from "~/form/parse.server";
import { newBuildSchemaServer } from "./feature-schemas.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await parseFormData({
    request,
    schema: newBuildSchemaServer,
  });

  if (!result.success) {
    return { fieldErrors: result.fieldErrors };
  }

  // ...
};
```

### Uniqueness Validation

Check for duplicates in the database:

```ts
// feature-schemas.server.ts
import { createTeamSchema } from "./feature-schemas";
import * as TeamRepository from "./TeamRepository.server";

export const createTeamSchemaServer = z.object({
  ...createTeamSchema.shape,
  name: createTeamSchema.shape.name.refine(
    async (name) => {
      const teams = await TeamRepository.findAllUndisbanded();
      const customUrl = mySlugify(name);
      return !teams.some((team) => team.customUrl === customUrl);
    },
    { message: "forms:errors.duplicateName" },
  ),
});
```

### Cross-Field Validation with superRefine

For complex validation involving multiple fields:

```ts
export const scrimsNewFormSchema = z
  .object({
    at: datetimeRequired({ label: "labels.start" }),
    maps: select({ label: "labels.maps", items: mapsItems }),
    mapsTournamentId: customField({ initialValue: null }, id.nullable()),
  })
  .superRefine((data, ctx) => {
    if (data.maps === "TOURNAMENT" && !data.mapsTournamentId) {
      ctx.addIssue({
        path: ["mapsTournamentId"],
        message: "errors.tournamentMustBeSelected",
        code: z.ZodIssueCode.custom,
      });
    }

    if (data.maps !== "TOURNAMENT" && data.mapsTournamentId) {
      ctx.addIssue({
        path: ["mapsTournamentId"],
        message: "errors.tournamentOnlyWhenMapsIsTournament",
        code: z.ZodIssueCode.custom,
      });
    }
  });
```

## Translations

All labels and text go in `locales/en/forms.json`:

```json
{
  "labels.name": "Name",
  "labels.bio": "Bio",
  "bottomTexts.bioHelp": "Write a short description",
  "errors.required": "This field is required",
  "errors.customError": "Custom error message",
  "options.type.free": "Free",
  "options.type.paid": "Paid"
}
```

NOTE: before adding a new one, verify one does not already exist.

### Translation Key Conventions

- Labels: `labels.fieldName`
- Bottom text: `bottomTexts.fieldName`
- Errors: `errors.errorKey`
- Select options: `options.fieldName.value`
- Mode names: `modes.SZ`, `modes.TC`, etc.

Run `npm run i18n:sync` after adding English translations to initialize other language files.

## E2E Testing

Use `createFormHelpers` for type-safe form interactions:

```ts
import { createFormHelpers } from "~/utils/playwright-form";
import { myFormSchema } from "~/features/my/my-schemas";

test("fills and submits form", async ({ page }) => {
  const form = createFormHelpers(page, myFormSchema);

  await form.fill("name", "Test Name");
  await form.fill("bio", "Test bio text");
  await form.check("isPublic");
  await form.select("type", "PAID");
  await form.setDateTime("date", new Date(2024, 5, 15, 14, 30));
  await form.submit();
});
```

### Available Helper Methods

| Method | Usage |
|--------|-------|
| `fill(name, value)` | Fill text input |
| `check(name)` | Check a toggle/checkbox |
| `uncheck(name)` | Uncheck a toggle/checkbox |
| `select(name, optionValue)` | Select dropdown option by value |
| `checkItems(name, values)` | Check specific checkbox group items |
| `selectUser(name, userName)` | Search and select user |
| `selectWeapons(name, weaponNames)` | Select weapons in weapon pool |
| `setDateTime(name, date)` | Set datetime picker |
| `submit()` | Click submit button |
| `getLabel(name)` | Get translated label for field |
| `getItemLabel(name, value)` | Get translated label for select item |

### Custom Fields in Tests

For custom fields without standard form helpers, use Playwright directly:

```ts
// Custom field interactions
await page.getByLabel("Player (Pov)").click();
await page.getByTestId("user-search-input").fill("Sendou");

// Stage/weapon selects with test-id
await selectStage({ page, name: "Museum d'Alfonsino" });
await selectWeapon({ page, name: "Tenta Brella", testId: "match-0-weapon" });
```

### Test Helpers from Playwright Utils

```ts
import {
  navigate,
  submit,
  selectStage,
  selectWeapon,
  selectUser,
} from "~/utils/playwright";
```

## Complete Example

### Schema (`feature-schemas.ts`)

```ts
import { z } from "zod";
import {
  textFieldRequired,
  textAreaOptional,
  select,
  toggle,
  stringConstant,
} from "~/form/fields";

export const createItemSchema = z.object({
  _action: stringConstant("CREATE"),
  name: textFieldRequired({
    label: "labels.itemName",
    maxLength: 100,
  }),
  description: textAreaOptional({
    label: "labels.description",
    bottomText: "bottomTexts.descriptionHelp",
    maxLength: 500,
  }),
  category: select({
    label: "labels.category",
    items: [
      { label: "options.category.general", value: "GENERAL" },
      { label: "options.category.special", value: "SPECIAL" },
    ],
  }),
  isActive: toggle({
    label: "labels.isActive",
  }),
});
```

### Route Component (`route.tsx`)

```tsx
import { SendouForm } from "~/form/SendouForm";
import { createItemSchema } from "./feature-schemas";

export default function NewItemPage() {
  return (
    <SendouForm schema={createItemSchema}>
      {({ FormField }) => (
        <>
          <FormField name="name" />
          <FormField name="description" />
          <FormField name="category" />
          <FormField name="isActive" />
        </>
      )}
    </SendouForm>
  );
}
```

### Action (`route.server.ts`)

```ts
import { redirect, type ActionFunctionArgs } from "react-router";
import { parseFormData } from "~/form/parse.server";
import { createItemSchema } from "./feature-schemas";
import * as ItemRepository from "./ItemRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await parseFormData({
    request,
    schema: createItemSchema,
  });

  if (!result.success) {
    return { fieldErrors: result.fieldErrors };
  }

  await ItemRepository.create(result.data);
  return redirect("/items");
};
```

### E2E Test (`feature.spec.ts`)

```ts
import { createFormHelpers } from "~/utils/playwright-form";
import { createItemSchema } from "~/features/item/feature-schemas";
import { test, navigate, impersonate, seed } from "~/utils/playwright";

test("creates new item", async ({ page }) => {
  await seed(page);
  await impersonate(page);
  await navigate({ page, url: "/items/new" });

  const form = createFormHelpers(page, createItemSchema);

  await form.fill("name", "Test Item");
  await form.fill("description", "A test description");
  await form.select("category", "SPECIAL");
  await form.check("isActive");
  await form.submit();

  await expect(page).toHaveURL("/items");
});
```

### Translations (`locales/en/forms.json`)

```json
{
  "labels.itemName": "Name",
  "labels.description": "Description",
  "labels.category": "Category",
  "labels.isActive": "Active",
  "bottomTexts.descriptionHelp": "Optional description for the item",
  "options.category.general": "General",
  "options.category.special": "Special"
}
```
