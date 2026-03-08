import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'latex' },
            new LatexDocumentSymbolProvider()
        )
    );

    let terminal: vscode.Terminal | undefined;
    const companionExtensionId = 'mathematic.vscode-latex';
    const companionExtensionUrl = 'https://marketplace.visualstudio.com/items?itemName=mathematic.vscode-latex';

    async function promptInstallCompanionExtension(forcePrompt: boolean, showInstalledNotice: boolean = forcePrompt) {
        const config = vscode.workspace.getConfiguration('texify');
        const isEnabled = config.get<boolean>('enableCompanionExtension', false);

        if (!forcePrompt && !isEnabled) {
            return;
        }

        if (vscode.extensions.getExtension(companionExtensionId)) {
            if (showInstalledNotice) {
                void vscode.window.showInformationMessage(vscode.l10n.t('The companion LaTeX extension "LaTeX" is already installed.'));
            }
            return;
        }

        const installLabel = vscode.l10n.t('Install');
        const showExtensionLabel = vscode.l10n.t('Show extension');
        const notNowLabel = vscode.l10n.t('Not now');
        const selection = await vscode.window.showInformationMessage(
            vscode.l10n.t('TeXify can optionally install the companion LaTeX extension "LaTeX" (mathematic.vscode-latex) for syntax highlighting and formatting.'),
            installLabel,
            showExtensionLabel,
            notNowLabel
        );

        if (selection === installLabel) {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', companionExtensionId);
        } else if (selection === showExtensionLabel) {
            await vscode.env.openExternal(vscode.Uri.parse(companionExtensionUrl));
        }
    }

    async function runScriptCommand(commandConfigBase: string, defaultCmd: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage(vscode.l10n.t('No active LaTeX file found.'));
            return;
        }

        const document = editor.document;
        
        // save document if it has unsaved changes, so the script always works with the latest version
        if (document.isDirty) {
            await document.save();
        }

        // load settings
        const config = vscode.workspace.getConfiguration('texify');
        const cmd = config.get<string>(`${commandConfigBase}Command`, defaultCmd);
        let args = config.get<string>(`${commandConfigBase}Args`, '-i "${file}"');

        if (!cmd) {
            return;
        }

        // replace placeholder ${file} with the actual file path
        const filePath = document.uri.fsPath;
        args = args.replace(/\$\{file\}/g, filePath);

        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = vscode.window.createTerminal(vscode.l10n.t('TeXify Terminal'));
        }
        terminal.show();
        terminal.sendText(`${cmd} ${args}`);
    }

    // main compile command
    context.subscriptions.push(vscode.commands.registerCommand('texify.compile', () => {
        runScriptCommand('compiler', '.build-kit/bin/tex-compile.sh');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('texify.installCompanionExtension', () => {
        return promptInstallCompanionExtension(true);
    }));

    // 5 custom action commands
    for (let i = 1; i <= 5; i++) {
        context.subscriptions.push(vscode.commands.registerCommand(`texify.action${i}`, () => {
            runScriptCommand(`action${i}`, '');
        }));
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('texify.enableCompanionExtension')) {
            const config = vscode.workspace.getConfiguration('texify');
            const isEnabled = config.get<boolean>('enableCompanionExtension', false);
            if (isEnabled) {
                void promptInstallCompanionExtension(false, true);
            } else {
                void vscode.window.showInformationMessage(vscode.l10n.t('The companion LaTeX extension integration is disabled.'));
            }
        }
    }));

    void promptInstallCompanionExtension(false);
}

function getStructureLevel(type: string): number {
    if (type === 'part') { return 0; }
    if (type === 'chapter') { return 1; }
    
    const subCount = (type.match(/sub/g) || []).length;
    
    if (type.endsWith('section')) {
        return 2 + subCount;
    }
    if (type.endsWith('paragraph')) {
        return 20 + subCount;
    }
    return 99;
}

class LatexDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        cancelToken: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const symbolStack: { symbol: vscode.DocumentSymbol; level: number }[] = [];

        // match structural LaTeX commands like \section{Title}, \subsection*{Subtitle}, \subsubsubsection{...}
        const regex = /^\s*\\(part|chapter|(?:sub)*section|(?:sub)*paragraph)\*?(?:\[[^\]]*\])?\{([^}]+)\}/;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const match = line.text.match(regex);

            if (match) {
                const type = match[1];
                const title = match[2];
                const level = getStructureLevel(type);

                const symbol = new vscode.DocumentSymbol(
                    title,
                    type,
                    vscode.SymbolKind.String,
                    line.range,
                    line.range
                );

                // pop symbols from the stack that have a level greater than or equal to the current one
                while (symbolStack.length > 0 && symbolStack[symbolStack.length - 1].level >= level) {
                    const popped = symbolStack.pop()!;
                    const endLine = Math.max(0, i - 1);
                    popped.symbol.range = new vscode.Range(
                        popped.symbol.range.start,
                        document.lineAt(endLine).range.end
                    );
                }

                if (symbolStack.length === 0) {
                    symbols.push(symbol);
                } else {
                    symbolStack[symbolStack.length - 1].symbol.children.push(symbol);
                }

                symbolStack.push({ symbol, level });
            }
        }

        const lastLineIndex = Math.max(0, document.lineCount - 1);
        const lastLineEnd = document.lineCount > 0 ? document.lineAt(lastLineIndex).range.end : new vscode.Position(0, 0);

        while (symbolStack.length > 0) {
            const popped = symbolStack.pop()!;
            popped.symbol.range = new vscode.Range(
                popped.symbol.range.start,
                lastLineEnd
            );
        }

        return symbols;
    }
}
