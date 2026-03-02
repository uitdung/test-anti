import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { removeHtmlComments, hasFrontmatter, ensureFrontmatter, extractFileName, ensureAntigravityFrontmatter } from './mdTransformer';

export type SyncMode = 'rules' | 'claude' | 'both';

export interface MdFile {
    name: string;
    path: string;
    enabled: boolean;
    syncMode: SyncMode;
    lastModified: Date;
}

export class MdManager {
    private workspaceRoot: string;
    private context: vscode.ExtensionContext;
    private files: Map<string, MdFile> = new Map();

    private readonly STATE_KEY = 'mdToRules.enabledFiles';
    private readonly SYNC_MODE_KEY = 'mdToRules.fileSyncModes';

    constructor(workspaceRoot: string, context: vscode.ExtensionContext) {
        this.workspaceRoot = workspaceRoot;
        this.context = context;
    }

    /**
     * Get source folder from configuration
     */
    getSourceFolder(): string {
        const config = vscode.workspace.getConfiguration('mdToRules');
        const sourceFolder = config.get<string>('sourceFolder', '.agents/memory');
        return path.join(this.workspaceRoot, sourceFolder);
    }

    /**
     * Get rules folder from configuration
     */
    getRulesFolder(): string {
        const config = vscode.workspace.getConfiguration('mdToRules');
        const rulesFolder = config.get<string>('rulesFolder', '.agents/rules');
        return path.join(this.workspaceRoot, rulesFolder);
    }

    /**
     * Get CLAUDE.md path from configuration
     */
    getClaudeFilePath(): string {
        const config = vscode.workspace.getConfiguration('mdToRules');
        const claudeFile = config.get<string>('claudeFilePath', 'CLAUDE.md');
        return path.join(this.workspaceRoot, claudeFile);
    }

    /**
     * Get default sync mode from configuration
     */
    getDefaultSyncMode(): SyncMode {
        const config = vscode.workspace.getConfiguration('mdToRules');
        return config.get<SyncMode>('defaultSyncMode', 'rules');
    }

    /**
     * Scan source directory for .md files
     */
    scanFiles(): MdFile[] {
        const sourceFolder = this.getSourceFolder();
        this.files.clear();

        // Create source directory if it doesn't exist
        if (!fs.existsSync(sourceFolder)) {
            fs.mkdirSync(sourceFolder, { recursive: true });
            console.log(`Created source directory: ${sourceFolder}`);
            return [];
        }

        // Load enabled state from storage
        const enabledFiles = this.context.globalState.get<string[]>(this.STATE_KEY, []);
        const syncModes = this.context.globalState.get<Record<string, SyncMode>>(this.SYNC_MODE_KEY, {});

        // Scan for .md files
        const files = fs.readdirSync(sourceFolder)
            .filter(file => file.endsWith('.md'))
            .map(file => {
                const filePath = path.join(sourceFolder, file);
                const stat = fs.statSync(filePath);
                const mdFile: MdFile = {
                    name: file,
                    path: filePath,
                    enabled: enabledFiles.includes(file),
                    syncMode: syncModes[file] || this.getDefaultSyncMode(),
                    lastModified: stat.mtime
                };
                this.files.set(file, mdFile);
                return mdFile;
            });

        return files;
    }

    /**
     * Get all files
     */
    getFiles(): MdFile[] {
        return Array.from(this.files.values());
    }

    /**
     * Get file by name
     */
    getFile(name: string): MdFile | undefined {
        return this.files.get(name);
    }

    /**
     * Toggle file sync state
     */
    toggleFile(name: string): boolean {
        const file = this.files.get(name);
        if (file) {
            file.enabled = !file.enabled;
            this.saveEnabledState();

            if (file.enabled) {
                this.syncFile(file);
            } else {
                this.removeFromDestinations(file);
            }

            return file.enabled;
        }
        return false;
    }

    /**
     * Change sync mode for a file
     */
    changeSyncMode(name: string, mode: SyncMode): void {
        const file = this.files.get(name);
        if (file) {
            file.syncMode = mode;
            this.saveEnabledState();
            
            if (file.enabled) {
                this.syncFile(file);
            }
        }
    }

    /**
     * Save enabled state and sync modes to global state
     */
    private saveEnabledState(): void {
        const enabledFiles = Array.from(this.files.values())
            .filter(f => f.enabled)
            .map(f => f.name);
        
        const syncModes: Record<string, SyncMode> = {};
        this.files.forEach((file, name) => {
            syncModes[name] = file.syncMode;
        });

        this.context.globalState.update(this.STATE_KEY, enabledFiles);
        this.context.globalState.update(this.SYNC_MODE_KEY, syncModes);
    }

    /**
     * Sync a single file to destinations
     */
    async syncFile(file: MdFile): Promise<{ rules: boolean; claude: boolean }> {
        const result = { rules: false, claude: false };

        try {
            // Read source file
            const rawContent = fs.readFileSync(file.path, 'utf8');
            
            // Transform: Remove HTML comments
            const transformed = removeHtmlComments(rawContent);
            const content = transformed.content;

            // Sync to rules folder
            if (file.syncMode === 'rules' || file.syncMode === 'both') {
                result.rules = await this.syncToRules(file, content);
            }

            // Sync to CLAUDE.md
            if (file.syncMode === 'claude' || file.syncMode === 'both') {
                result.claude = await this.syncToClaudeMd(file, content);
            }

            console.log(`Synced: ${file.name} (comments removed: ${transformed.commentsRemoved})`);
        } catch (error) {
            console.error(`Failed to sync ${file.name}:`, error);
        }

        return result;
    }

    /**
     * Sync to .agents/rules folder
     */
    private async syncToRules(file: MdFile, content: string): Promise<boolean> {
        const rulesFolder = this.getRulesFolder();

        try {
            if (!fs.existsSync(rulesFolder)) {
                fs.mkdirSync(rulesFolder, { recursive: true });
            }

            // Ensure Antigravity frontmatter
            const finalContent = ensureAntigravityFrontmatter(content, file.name);
            
            const targetPath = path.join(rulesFolder, file.name);
            fs.writeFileSync(targetPath, finalContent, 'utf8');

            console.log(`Synced to rules: ${file.name}`);
            return true;
        } catch (error) {
            console.error(`Failed to sync to rules:`, error);
            return false;
        }
    }

    /**
     * Sync to CLAUDE.md as a section
     */
    private async syncToClaudeMd(file: MdFile, content: string): Promise<boolean> {
        const claudePath = this.getClaudeFilePath();

        try {
            let claudeContent = '';
            
            if (fs.existsSync(claudePath)) {
                claudeContent = fs.readFileSync(claudePath, 'utf8');
            }

            // Strip frontmatter for section content
            const sectionContent = this.stripFrontmatter(content);
            const sectionName = extractFileName(file.name);

            claudeContent = this.updateSection(claudeContent, sectionName, sectionContent);

            fs.writeFileSync(claudePath, claudeContent, 'utf8');

            console.log(`Synced to CLAUDE.md: section "${sectionName}"`);
            return true;
        } catch (error) {
            console.error(`Failed to sync to CLAUDE.md:`, error);
            return false;
        }
    }

    /**
     * Strip YAML frontmatter from markdown
     */
    private stripFrontmatter(markdown: string): string {
        const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n?/;
        return markdown.replace(frontmatterRegex, '');
    }

    /**
     * Update or add a section in CLAUDE.md using XML-style tags
     */
    private updateSection(content: string, sectionName: string, sectionBody: string): string {
        const escapedName = this.escapeRegex(sectionName);
        
        // Pattern to find XML-style section: <rule-file name="sectionName">...</rule-file>
        const sectionRegex = new RegExp(
            `<rule-file\\s+name="${escapedName}"[^>]*>[\\s\\S]*?<\\/rule-file>`,
            'g'
        );

        const match = content.match(sectionRegex);

        if (match) {
            // Section exists - replace entire block
            const newSection = `<rule-file name="${sectionName}">\n${sectionBody.trim()}\n</rule-file>`;
            return content.replace(sectionRegex, newSection);
        } else {
            // Section doesn't exist - append at end
            const newSection = `\n<rule-file name="${sectionName}">\n${sectionBody.trim()}\n</rule-file>\n`;
            
            if (content && !content.endsWith('\n')) {
                return content + '\n' + newSection;
            }
            return content + newSection;
        }
    }

    /**
     * Escape special regex characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Remove file from all destinations
     */
    private removeFromDestinations(file: MdFile): void {
        if (file.syncMode === 'rules' || file.syncMode === 'both') {
            const rulesPath = path.join(this.getRulesFolder(), file.name);
            if (fs.existsSync(rulesPath)) {
                fs.unlinkSync(rulesPath);
                console.log(`Removed from rules: ${file.name}`);
            }
        }

        if (file.syncMode === 'claude' || file.syncMode === 'both') {
            this.removeSectionFromClaudeMd(file);
        }
    }

    /**
     * Remove section from CLAUDE.md
     */
    private removeSectionFromClaudeMd(file: MdFile): void {
        const claudePath = this.getClaudeFilePath();
        
        if (!fs.existsSync(claudePath)) {
            return;
        }

        try {
            let content = fs.readFileSync(claudePath, 'utf8');
            const sectionName = extractFileName(file.name);
            
            // Remove XML-style section
            const sectionRegex = new RegExp(
                `\\n?<rule-file\\s+name="${this.escapeRegex(sectionName)}"[^>]*>[\\s\\S]*?<\\/rule-file>\\n?`,
                'g'
            );
            
            content = content.replace(sectionRegex, '\n');
            fs.writeFileSync(claudePath, content, 'utf8');
            
            console.log(`Removed section "${sectionName}" from CLAUDE.md`);
        } catch (error) {
            console.error(`Failed to remove section from CLAUDE.md:`, error);
        }
    }

    /**
     * Sync all enabled files
     */
    async syncAll(): Promise<{ synced: number; skipped: number; errors: number }> {
        let synced = 0;
        let skipped = 0;
        let errors = 0;

        for (const file of this.files.values()) {
            if (file.enabled) {
                const result = await this.syncFile(file);
                if (result.rules || result.claude) {
                    synced++;
                } else {
                    errors++;
                }
            } else {
                skipped++;
            }
        }

        return { synced, skipped, errors };
    }

    /**
     * Create a new markdown file
     */
    async createFile(name: string): Promise<{ success: boolean; path?: string; error?: string }> {
        const sanitizedName = this.sanitizeFileName(name);
        const fileName = sanitizedName.endsWith('.md') ? sanitizedName : `${sanitizedName}.md`;
        const sourceFolder = this.getSourceFolder();

        if (!fs.existsSync(sourceFolder)) {
            fs.mkdirSync(sourceFolder, { recursive: true });
        }

        const filePath = path.join(sourceFolder, fileName);

        if (fs.existsSync(filePath)) {
            return { success: false, error: `File ${fileName} already exists` };
        }

        const content = this.createTemplate(sanitizedName.replace(/\.md$/i, ''));

        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    /**
     * Sanitize filename to prevent path traversal
     */
    private sanitizeFileName(name: string): string {
        return name
            .replace(/[\/\\]/g, '')
            .replace(/\.\./g, '')
            .replace(/[<>:"|?*]/g, '')
            .trim();
    }

    /**
     * Create template content for new file
     */
    private createTemplate(name: string): string {
        return `---
name: ${name}
description: Description of this rule
---

# ${name}

> [!NOTE]
> This is a memory rule file. Edit this content to define your custom rule.

## Instructions

Add your custom instructions here.

## Examples

\`\`\`
Example usage or code snippets
\`\`\`
`;
    }

    /**
     * Set source folder in configuration
     */
    async setSourceFolder(folderPath: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('mdToRules');
        await config.update('sourceFolder', folderPath, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Check if CLAUDE.md exists
     */
    claudeFileExists(): boolean {
        return fs.existsSync(this.getClaudeFilePath());
    }

    /**
     * Check if rules folder exists
     */
    rulesFolderExists(): boolean {
        return fs.existsSync(this.getRulesFolder());
    }
}
