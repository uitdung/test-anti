import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MdManager, SyncMode } from './mdManager';
import { MdSidebarProvider, MdTreeItem } from './sidebarProvider';
import { FileWatcher } from './fileWatcher';

let mdManager: MdManager;
let sidebarProvider: MdSidebarProvider;
let fileWatcher: FileWatcher;

export function activate(context: vscode.ExtensionContext) {
    console.log('MD to Rules Sync extension is now active!');

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        console.log('No workspace folder found');
        return;
    }

    // Initialize manager
    mdManager = new MdManager(workspaceRoot, context);

    // Initialize sidebar
    sidebarProvider = new MdSidebarProvider(mdManager);
    const treeView = vscode.window.createTreeView('mdToRulesSidebar', {
        treeDataProvider: sidebarProvider,
        showCollapseAll: false
    });

    // Initialize file watcher
    fileWatcher = new FileWatcher(mdManager, sidebarProvider);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('mdToRules.refresh', () => {
            mdManager.scanFiles();
            sidebarProvider.refresh();
            showDestinationsStatus();
            vscode.window.showInformationMessage('📁 Files refreshed');
        }),

        vscode.commands.registerCommand('mdToRules.toggleFile', (item: MdTreeItem) => {
            if (item.file) {
                const newState = mdManager.toggleFile(item.file.name);
                sidebarProvider.refresh();
                const modeDesc = getModeDescription(item.file.syncMode);
                vscode.window.showInformationMessage(
                    `${newState ? '✅ Enabled' : '⬜ Disabled'} sync for ${item.file.name} → ${modeDesc}`
                );
            }
        }),

        vscode.commands.registerCommand('mdToRules.syncAll', async () => {
            const result = await mdManager.syncAll();
            let message = `🔄 Synced ${result.synced} files`;
            if (result.skipped > 0) message += `, skipped ${result.skipped}`;
            if (result.errors > 0) message += `, ${result.errors} errors`;
            vscode.window.showInformationMessage(message);
        }),

        vscode.commands.registerCommand('mdToRules.openFile', async (item: MdTreeItem) => {
            if (item.file) {
                const uri = vscode.Uri.file(item.file.path);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
            }
        }),

        vscode.commands.registerCommand('mdToRules.createFile', async () => {
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter file name (without .md extension)',
                placeHolder: 'e.g., my-new-rule'
            });

            if (fileName) {
                const result = await mdManager.createFile(fileName);
                if (result.success) {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.path!));
                    await vscode.window.showTextDocument(doc);
                    sidebarProvider.refresh();
                    vscode.window.showInformationMessage(`✅ Created ${fileName}.md`);
                } else {
                    vscode.window.showErrorMessage(result.error || 'Failed to create file');
                }
            }
        }),

        vscode.commands.registerCommand('mdToRules.selectSourceFolder', async () => {
            const folders = await getWorkspaceFolders(workspaceRoot);
            
            const selected = await vscode.window.showQuickPick(
                folders.map(f => ({
                    label: f.name,
                    description: f.path,
                    detail: f.hasMd ? '📁 Contains .md files' : 'Empty folder'
                })),
                {
                    placeHolder: 'Select source folder for markdown files',
                    title: 'Source Folder Selection'
                }
            );

            if (selected) {
                const relativePath = path.relative(workspaceRoot, selected.description || '');
                await mdManager.setSourceFolder(relativePath || selected.label);
                mdManager.scanFiles();
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`📁 Source folder set to: ${selected.label}`);
            }
        }),

        vscode.commands.registerCommand('mdToRules.changeSyncMode', async (item: MdTreeItem) => {
            if (!item.file) return;

            const modes: { label: string; description: string; mode: SyncMode }[] = [
                { label: '📁 Rules Folder', description: 'Save to .agents/rules/', mode: 'rules' },
                { label: '📄 CLAUDE.md', description: 'Append/replace section in CLAUDE.md', mode: 'claude' },
                { label: '📁📄 Both', description: 'Save to both locations', mode: 'both' }
            ];

            const selected = await vscode.window.showQuickPick(
                modes.map(m => ({
                    label: m.label,
                    description: m.description,
                    mode: m.mode,
                    picked: item.file!.syncMode === m.mode
                })),
                {
                    placeHolder: `Select sync mode for ${item.file.name}`,
                    title: 'Sync Mode'
                }
            );

            if (selected) {
                mdManager.changeSyncMode(item.file.name, selected.mode);
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`📝 Sync mode: ${selected.label}`);
            }
        })
    ];

    context.subscriptions.push(...commands, treeView);

    // Initial scan
    mdManager.scanFiles();
    sidebarProvider.refresh();
    
    // Show status on activation
    showDestinationsStatus();
}

function getModeDescription(mode: SyncMode): string {
    switch (mode) {
        case 'rules': return '.agents/rules';
        case 'claude': return 'CLAUDE.md';
        case 'both': return 'both locations';
        default: return mode;
    }
}

function showDestinationsStatus() {
    const rulesExists = mdManager.rulesFolderExists();
    const claudeExists = mdManager.claudeFileExists();
    
    let status = '📍 Destinations: ';
    status += rulesExists ? '✅ .agents/rules' : '⚠️ .agents/rules (will create)';
    status += ' | ';
    status += claudeExists ? '✅ CLAUDE.md' : '⚠️ CLAUDE.md (will create)';
    
    console.log(status);
}

async function getWorkspaceFolders(workspaceRoot: string): Promise<{ name: string; path: string; hasMd: boolean }[]> {
    const folders: { name: string; path: string; hasMd: boolean }[] = [];
    
    async function scanDir(dir: string, depth: number = 0) {
        if (depth > 3) return;
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    const fullPath = path.join(dir, entry.name);
                    const files = fs.readdirSync(fullPath);
                    const hasMd = files.some(f => f.endsWith('.md'));
                    const relativePath = path.relative(workspaceRoot, fullPath);
                    
                    if (!relativePath.includes('node_modules') && !relativePath.startsWith('.')) {
                        folders.push({
                            name: relativePath,
                            path: fullPath,
                            hasMd
                        });
                        
                        await scanDir(fullPath, depth + 1);
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors
        }
    }

    // Add defaults
    folders.push({
        name: '.agents/memory (default)',
        path: path.join(workspaceRoot, '.agents/memory'),
        hasMd: false
    });
    
    const rootFiles = fs.readdirSync(workspaceRoot);
    const rootHasMd = rootFiles.some(f => f.endsWith('.md'));
    folders.push({
        name: '. (workspace root)',
        path: workspaceRoot,
        hasMd: rootHasMd
    });

    await scanDir(workspaceRoot);
    
    return folders;
}

export function deactivate() {
    console.log('MD to Rules Sync extension deactivated');
    if (fileWatcher) {
        fileWatcher.dispose();
    }
}
