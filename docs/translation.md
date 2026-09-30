# Translation

[Translation Progress](https://github.com/sendou-ink/sendou.ink/issues/1104)

sendou.ink can be translated into any language. All translation files can be found in the [locales folder](../locales). Here is how you can contribute:

1. Open a `.json` file for your language (e.g. `locales/de/common.json` for German)
2. Find empty strings (`""`) - these are the lines that need translating
3. Translate them while keeping the "key" on the left side of `:` unchanged. For example `"country": "",` could become `"country": "Maa",`
4. Send the translated .json to Sendou or make a pull request

Things to note:

- `weapons.json` and `gear.json` are auto-generated. Don't touch these.
- If you want to add a new language, ask Sendou.
- Some lines have dynamic parts like `"articleBy": "by {{author}}"`. The `{{author}}` part should appear in the translated version unchanged - don't translate the part inside `{{}}`.
- Another special syntax: `"project": "Sendou.ink is a project by <2>Sendou</2> with help from contributors:"`. The `<2></2>` tags should appear in the translated version, but the text inside them can change.
- Some English keys come in plural variants like `"tournament_one"` and `"tournament_other"`. Languages that only have a single plural form (e.g. Chinese, Japanese, Korean) can only hold **one** translation for such a key, so during syncing these variants are collapsed into a single key (e.g. `"tournament"`). When collapsing, the `_other` value is kept (it's the one that includes the `{{count}}` number), and the other variants are discarded. This means for these languages you should translate the `_other` variant. 

Any questions please ask Sendou!
