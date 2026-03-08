# Development

This file contains development and release notes for TeXify.

## Install Dependencies

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Watch Mode

```bash
npm run watch
```

## Run in Extension Development Host

- Open the project in VS Code
- Press `F5`
- Open a `.tex` file in the Extension Development Host window

If changes to `package.json` or localization files do not show up immediately:
- stop the debugger
- close the Extension Development Host window
- run `Developer: Reload Window`
- start `F5` again

## Package a VSIX

```bash
npm install
npm run compile
npm run package:vsix
```

## Publish Preparation

Before publishing to the VS Code Marketplace, update these fields in `package.json`:
- `publisher`

Already configured:
- repository: `https://github.com/thomas-schuster/texify.git`
- homepage: `https://github.com/thomas-schuster/texify#readme`
- issue tracker: `https://github.com/thomas-schuster/texify/issues`

## Release Notes

- Keep `CHANGELOG.md` updated
- Rebuild the VSIX before creating a release
- Prefer attaching VSIX files to GitHub Releases instead of committing them into the repository