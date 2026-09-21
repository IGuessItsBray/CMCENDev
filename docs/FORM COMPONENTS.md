# Shared form components

The first consumers are Banners, Awards, and Users in `/dashboard-next`. New forms can
use the same components without importing the public site's `styles.css`.
Existing pages adopt them deliberately as they are revised.

## Responsibilities

- `theme-tokens.css`: the site's palette and typography.
- `shared-forms.css`: opt-in field, control, choice, and group presentation.
- `shared-forms.js`: inline error presentation using native validity and the
  existing bilingual validation strings.
- Page code: field values, required rules, conditional visibility, business
  validation, draft state, submission, and API feedback.

There is no form schema, framework, global event binding, or automatic DOM
replacement. Static HTML and fields created with JavaScript use the same markup.
Use native inputs, selects, textareas, checkboxes, and radios. Existing custom
pickers retain their own behavior and use `cmcen-control` on their trigger.

## Field markup

Load `theme-tokens.css` first and `shared-forms.css` after page styles. Load
`shared-forms.js` after `app-utils.js` and translations, and before the page's
form script.

```html
<label class="cmcen-field">
  <span id="example-name-label" class="cmcen-field-label">Internal name</span>
  <input class="cmcen-control" name="name" required
    aria-labelledby="example-name-label" aria-describedby="example-name-help">
  <span id="example-name-help" class="cmcen-field-help">For staff reference only.</span>
  <span id="example-name-error" class="cmcen-field-error"></span>
</label>
```

IDs must be unique across the page. Label text belongs in `aria-labelledby`;
help and errors belong in `aria-describedby`, so explanatory text is not part
of the control's name. Keep labels visible and use placeholders only as examples.
Translate labels and help with the existing `data-i18n` convention.

For checkboxes and radios, add `cmcen-choice` to the field wrapper and omit
`cmcen-control` on the input. For a custom picker, use a `div.cmcen-field` with
a labelled visible trigger. Every validated field needs its own error element
with an ID. Related fields use `fieldset.cmcen-field-group` and `legend`.

Control height, radius, colours, and focus styles use `--form-*` properties.
The defaults support light/dark themes. A host can override these properties
at its container; page CSS should control layout rather than restyling inputs.
Textareas and multiline picker labels can grow. Disabled fields remain native
disabled controls, including inherited disabling through a `fieldset`.

## Validation and feedback

For dynamic fields, `CMCENForms.createField({ id, name, labelKey, type,
...attributes })` returns `{ field, control }`. Append `field` to the form and
use `control` for values and events. Supply a unique ID and either a translated
`labelKey` or a plain `label`. An `options` array creates a select; each option
has `value` and `labelKey` or `label`. Use `type: "textarea"` for multiline text.
Native attributes such as `required`, `maxLength`, and `disabled` are passed
through. The helper creates the label and error associations, but attaches no
listeners and does not manage values after creation.

Use `novalidate` on forms adopting inline errors. On submission, set business
errors with `setCustomValidity`, then call `CMCENForms.validate(form)`. It reads
the native validity state, displays all errors, and focuses the first invalid
control in DOM order. It does not submit the form or alter values/constraints.
The shared `CMCENUtils.focusInvalidField` helper reveals the field and its label:
it scrolls to the top when they fit there, otherwise leaves generous headroom
below the public header. Native browser validation uses the same positioning.
Scrollable panels move independently of the page behind them.

Custom pickers supply errors for their visible controls:

```js
CMCENForms.validate(form, {
  errors: [{ control: dateTrigger, message: dateError }],
  focus: true,
});
```

Do not show errors before the first Save attempt. After an attempt, revalidate
on input with `focus: false` so corrections clear errors without stealing focus.
Revalidate visible errors after a language change. Disable conditional fields
when hiding them, and clear errors when selecting a different record using
`CMCENForms.clearErrors(form)`. The helper preserves existing help associations.

Keep network failures beside the form's actions and preserve entered values.
Use the existing toast helper for brief success feedback. These components do
not own notifications, API calls, unsaved-change prompts, or form layouts.
