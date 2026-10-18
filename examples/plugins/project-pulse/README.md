# Project pulse: an example Igrek plugin

A plugin is a folder with a `igrek-plugin.json`. Install it from Tools > Plugins with the full path
of this folder (or a git URL), read what it asks for, then turn it on.

- `panels`: HTML pages Igrek shows on the Tools page (`"place": "tools"`) or in every project
  (`"place": "project"`). They run in a sandbox without network access.
- `permissions`: what the page may read through the bridge: `projects:read`, `memory:read`,
  `sessions:read`, `costs:read`, `uptime:read`. Nothing can be written.
- `commands`: shell commands run in a project's folder, in a terminal you can see, only when you
  click them.

`bridge.js` is all a page needs: `await igrek.hello` gives the theme, language and project, and
`igrek.ask("projects")` returns data the plugin has permission to read.
