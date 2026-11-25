# Preserving saved Creative Lab content

Treat user-edited text, palettes, recipes, photos, inventory, projects and annotated composition reviews as user data. Preserve existing browser storage keys, IndexedDB stores, origin and record IDs across releases. Populate defaults only for missing fields. Preserve empty collections, blank values and unrecognized fields. Opening the app or displaying an example must not replace user content. If a format must change, migrate existing records non-destructively and verify old records reopen with their content and images intact.

Before releasing changes to initialization or storage, verify reload with a custom palette, an intentionally empty inventory, an existing project and an annotated review. Keep authentication data separate from Studio documents.
