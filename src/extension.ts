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

    async function openOutlineView() {
        await vscode.commands.executeCommand('workbench.view.explorer');
        await vscode.commands.executeCommand('outline.focus');

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Open a LaTeX file with language mode "latex" to populate the Outline view.')
            );
        }
    }

    context.subscriptions.push(vscode.commands.registerCommand('texify.openOutline', () => {
        return openOutlineView();
    }));

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
    if (type === 'question') { return 50; }
    if (type === 'exampart') { return 51; }

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
        const structuralRegex = /^\s*\\(part|chapter|(?:sub)*section|(?:sub)*paragraph)\*?(?:\[[^\]]*\])?\{([^}]+)\}/;
        // match exam-style commands: \question and \part without a mandatory {title} argument
        const examRegex = /^\s*\\(question|part)\s*(?:\[([^\]]*)\])?\s*(?!\{)/;
        // match Beamer frames: \begin{frame}[opts]{Title} or \begin{frame}{Title} or \begin{frame}
        const beamerFrameRegex = /^\s*\\begin\{frame\}(?:\[[^\]]*\])*(?:\{([^}]*)\})?/;
        const beamerEndFrameRegex = /^\s*\\end\{frame\}/;
        const frameTitleRegex = /^\s*\\frametitle(?:\[[^\]]*\])?\{([^}]+)\}/;

        let questionCount = 0;
        let partCount = 0;
        let frameCount = 0;
        let currentFrameLevel: number | undefined;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);

            let type: string | undefined;
            let title: string | undefined;
            let detail: string | undefined;

            const structMatch = line.text.match(structuralRegex);
            if (structMatch) {
                type = structMatch[1];
                title = structMatch[2];
                detail = type;
            } else {
                const examMatch = line.text.match(examRegex);
                if (examMatch) {
                    const cmd = examMatch[1];
                    const points = examMatch[2];
                    if (cmd === 'question') {
                        questionCount++;
                        partCount = 0;
                        type = 'question';
                        const label = vscode.l10n.t('Question {0}', questionCount);
                        title = points ? `${label} [${points}]` : label;
                        detail = 'question';
                    } else {
                        // \part without {title} → exam part
                        partCount++;
                        type = 'exampart';
                        const letter = String.fromCharCode(96 + partCount); // a, b, c, ...
                        const label = `(${letter})`;
                        title = points ? `${label} [${points}]` : label;
                        detail = 'part';
                    }
                } else {
                    const beamerEndMatch = line.text.match(beamerEndFrameRegex);
                    if (beamerEndMatch) {
                        // Close open frame when \end{frame} is reached
                        if (currentFrameLevel !== undefined) {
                            while (symbolStack.length > 0 && symbolStack[symbolStack.length - 1].level >= currentFrameLevel) {
                                const popped = symbolStack.pop()!;
                                popped.symbol.range = new vscode.Range(
                                    popped.symbol.range.start,
                                    line.range.end
                                );
                            }
                            currentFrameLevel = undefined;
                        }
                        continue;
                    }

                    const beamerFrameMatch = line.text.match(beamerFrameRegex);
                    if (beamerFrameMatch) {
                        let frameTitle = beamerFrameMatch[1];
                        if (!frameTitle) {
                            // Look ahead for \frametitle{...} on the following lines
                            for (let j = i + 1; j < Math.min(i + 5, document.lineCount); j++) {
                                const nextLine = document.lineAt(j);
                                const frameTitleMatch = nextLine.text.match(frameTitleRegex);
                                if (frameTitleMatch) {
                                    frameTitle = frameTitleMatch[1];
                                    break;
                                }
                                if (/^\s*\\(?:begin|end)\{/.test(nextLine.text)) {
                                    break;
                                }
                            }
                        }
                        frameCount++;
                        type = 'frame';
                        title = frameTitle || vscode.l10n.t('Frame {0}', frameCount);
                        detail = 'frame';
                    }
                }
            }

            if (type === undefined || title === undefined) { continue; }

            {
                let level: number;
                if (type === 'frame') {
                    // Dynamic level: one deeper than the nearest non-frame structural parent.
                    // Skip any frames on top of the stack to avoid infinite nesting
                    // when \end{frame} is missing.
                    let structuralParentLevel = -1;
                    for (let k = symbolStack.length - 1; k >= 0; k--) {
                        if (symbolStack[k].symbol.detail !== 'frame') {
                            structuralParentLevel = symbolStack[k].level;
                            break;
                        }
                    }
                    level = structuralParentLevel >= 0 ? structuralParentLevel + 1 : 1;
                    currentFrameLevel = level;
                } else {
                    level = getStructureLevel(type);
                }

                const symbol = new vscode.DocumentSymbol(
                    title,
                    detail ?? type,
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
