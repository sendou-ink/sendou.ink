# Translation

[Translation Progress](https://github.com/Sendouc/sendou.ink/issues/1104)

sendou.ink can be translated into any language. All the translations can be found in the [locales folder](./locales). Here is how you can contribute:

1. Copy a `.json` file from `/en` folder.
2. Translate lines one by one. For example `"country": "Country",` could become `"country": "Maa",`. Keep the "key" on the left side of : unchanged.
3. Finally, send the translated .json to Sendou or make a pull request if you know how.

Things to note:

- `weapons.json` and `gear.json` are auto-generated. Don't touch these.
- If some language doesn't have a folder it can be added.
- Some translated `.json` files can also have some lines in English as new lines get added to the site. Those can then be translated.
- Some lines have a dynamic part like this one: `"articleBy": "by {{author}}"` in this case `{{author}}` should appear in the translated version unchanged. So in other words don't translate the part inside `{{}}`.
- There is one more special syntax to keep in mind. When you translate this line `"project": "Sendou.ink is a project by <2>Sendou</2> with help from contributors:",` the `<2></2>` should appear in the translated version. The text inside these tags can change.
- To update a translation file copy the existing file, do any modifications needed and send the updated one.

Any questions please ask Sendou!
