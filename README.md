# TeXify

TeXify is a Visual Studio Code extension for LaTeX workflows with a focus on practical document navigation and configurable build commands.

Repository: https://github.com/thomas-schuster/texify

## Features

- Outline support for LaTeX files in the VS Code Outline view
- Support for nested section commands such as `\\subsubsubsection`
- Compile button in the editor title area for active LaTeX files
- Five additional configurable actions for scripts or direct compiler commands
- Optional installation prompt for the companion LaTeX extension `mathematic.vscode-latex`
- Localized extension metadata and runtime messages in English, German, and French

## Outline Support

TeXify contributes document symbols so that LaTeX headings appear in the Outline view.

Supported structural commands include:
- `\\part`
- `\\chapter`
- `\\section`
- `\\subsection`
- arbitrary nested `\\sub...section`
- `\\paragraph`
- arbitrary nested `\\sub...paragraph`

## Build and Script Actions

When a LaTeX file is active, TeXify adds a compile button to the editor title area.

The button is intentionally generic. You can point it to:
- your own wrapper script
- a project-local build helper such as `.build-kit/bin/tex-compile.sh`
- a direct compiler command such as `lualatex`, `pdflatex`, `xelatex`, or another executable

Arguments are configured separately, so setups such as these are possible:
- script-based: `.build-kit/bin/tex-compile.sh` with `-i "${file}"`
- direct compiler call: `lualatex` with `-interaction=nonstopmode "${file}"`
- custom toolchain command with additional flags

Important:
- TeXify does not ship your compile script or build toolkit
- if you reference a script path, that script must exist in your project or on the target machine
- `${file}` is replaced with the active LaTeX file path when the command is executed

In addition, TeXify exposes five configurable custom actions that can be:
- triggered from the Command Palette
- assigned to keybindings
- backed by your own shell scripts, build helpers, or direct compiler commands

## Settings

Main settings:
- `texify.compilerCommand`
- `texify.compilerArgs`
- `texify.action1Command` to `texify.action5Command`
- `texify.action1Args` to `texify.action5Args`
- `texify.enableCompanionExtension`

## Companion Extension

TeXify can optionally prompt the user to install the companion LaTeX extension:
- Name: `LaTeX`
- ID: `mathematic.vscode-latex`

This companion extension is not installed automatically. Users can opt in through the TeXify setting or command.

It can complement TeXify with LaTeX editor features such as:
- syntax highlighting
- formatting support
- additional LaTeX language tooling, depending on its own configuration

Please note:
- TeXify itself does not require the companion extension
- the companion extension has its own setup and runtime requirements
- depending on the features you want to use, a local LaTeX toolchain may be required
- for formatting, the companion extension relies on `latexindent.pl`, which is a Perl-based formatter for LaTeX. Additional Perl modules may be required on the target system.
- for linting, the companion extension relies on `ChkTeX`

For details, always refer to the documentation of `mathematic.vscode-latex` itself.

## License

MIT. See [LICENSE](LICENSE).
