# Making a release

Each step here is something that went wrong once. The release is made by a person (agents never
publish on their own); the workflow builds and checks, it does not publish.

## Before the tag

1. **One version number.** Set the new version in all five `package.json` files and in `APP_VERSION`
   (`packages/core/src/index.ts`). `apps/server/src/version.test.ts` fails if they differ; 0.1.4 and 0.1.5
   called themselves 0.1.3 because `APP_VERSION` was left behind.
2. **Every check of AGENTS.md passes**, `bun run test:e2e` too, and `bun run test:crawl` when the interface
   changed.
3. **Release notes** in plain words: what changed for the person using Igrek, not how. If a version was
   never published, its changes go into the next notes.
4. **A Rust dependency's features** are what the Windows build needs too: a feature can be switched on
   by another crate on Linux and not on Windows (0.1.4's Windows build failed on `zip` this way). When
   `Cargo.toml` changes, run `cargo tree --target x86_64-pc-windows-msvc -e features` for the crate.

## The tag

Push the commit, then the tag `vX.Y.Z`. The Desktop app workflow builds every package, then:

- starts the server bundle on every system and stops it (`apps/desktop/scripts/smoke.ts`);
- opens the Linux AppImage as a user first does, with no runtime and an empty data folder, and waits for
  the server to say this version (`apps/desktop/scripts/first-start.sh`). 0.1.5 shipped an AppImage that
  could not start; this is the check that would have stopped it.
- writes `latest.json` from the signatures.

A tag that failed is not moved: fix it, raise the version and tag again.

## Publishing

1. Download the workflow's artifacts and check that the four signatures in `latest.json` match the
   `.sig` files and that its addresses name this tag.
2. Create the release as a **draft**, upload every package, compare each uploaded size with the file.
3. Upload `latest.json` **last**, then publish and mark it latest. Until then installed apps do not see
   the new version, so none of them meets a half-uploaded release.
4. Check `https://github.com/Mohamedattiadev/igrek/releases/latest/download/latest.json` says the version.
5. Rebuild the site, whose download links name the version: `python3 scripts/site/build.py . X.Y.Z`,
   commit it, and publish it with the Site workflow (Actions, by hand).

## After

- Install it on your own computer the way users get it, and open it once.
- If a package turns out broken, say so at the top of that release's notes, pointing to the fixed one.
