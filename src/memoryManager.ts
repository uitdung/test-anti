import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface MemoryFile {
    name: string;
    path: string;
    enabled: boolean;
    lastModified: Date;
}

export class MemoryManager {
    private workspaceRoot: string;
    private context: vscode.ExtensionContext;
    private files: Map<string, MemoryFile> = new Map();

    private readonly MEMORY_DIR = '.agents/memory';
    private readonly RULES_DIR = '.agents/rules';
    private readonly STATE_KEY = 'memoryToRules.enabledFiles';

    constructor(workspaceRoot: string, context: vscode.ExtensionContext) {
        this.workspaceRoot = workspaceRoot;
        this.context = context;
    }

    /**
     * Get memory directory path
     */
    getMemoryDir(): string {
        return path.join(this.workspaceRoot, this.MEMORY_DIR);
    }

    /**
     * Get rules directory path
     */
    getRulesDir(): string {
        return path.join(this.workspaceRoot, this.RULES_DIR);
    }

    /**
     * Scan memory directory for .md files
     */
    scanFiles(): MemoryFile[] {
        const memoryDir = this.getMemoryDir();
        this.files.clear();

        // Create memory directory if it doesn't exist
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
            console.log(`Created memory directory: ${memoryDir}`);
            return [];
        }

        // Load enabled state from storage
        const enabledFiles = this.context.globalState.get<string[]>(this.STATE_KEY, []);

        // Scan for .md files
        const files = fs.readdirSync(memoryDir)
            .filter(file => file.endsWith('.md'))
            .map(file => {
                const filePath = path.join(memoryDir, file);
                const stat = fs.statSync(filePath);
                const memoryFile: MemoryFile = {
                    name: file,
                    path: filePath,
                    enabled: enabledFiles.includes(file),
                    lastModified: stat.mtime
                };
                this.files.set(file, memoryFile);
                return memoryFile;
            });

        return files;
    }

    /**
     * Get all files
     */
    getFiles(): MemoryFile[] {
        return Array.from(this.files.values());
    }

    /**
     * Get file by name
     */
    getFile(name: string): MemoryFile | undefined {
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

            // Sync immediately if enabled
            if (file.enabled) {
                this.syncFile(file);
            } else {
                // Remove from rules if disabled
                this.removeFromRules(file);
            }

            return file.enabled;
        }
        return false;
    }

    /**
     * Save enabled state to global state
     */
    private saveEnabledState(): void {
        const enabledFiles = Array.from(this.files.values())
            .filter(f => f.enabled)
            .map(f => f.name);
        this.context.globalState.update(this.STATE_KEY, enabledFiles);
    }

    /**
     * Sync a single file to rules
     */
    async syncFile(file: MemoryFile): Promise<boolean> {
        const rulesDir = this.getRulesDir();

        try {
            // Create rules directory if needed
            if (!fs.existsSync(rulesDir)) {
                fs.mkdirSync(rulesDir, { recursive: true });
            }

            // Read source file
            let content = fs.readFileSync(file.path, 'utf8');

            // Add YAML frontmatter if missing
            if (!content.startsWith('---')) {
                const name = path.basename(file.name, '.md');
                content = this.addFrontmatter(content, name);
            }

            // Write to rules directory
            const targetPath = path.join(rulesDir, file.name);
            fs.writeFileSync(targetPath, content, 'utf8');

            console.log(`Synced: ${file.name} → ${targetPath}`);
            return true;
        } catch (error) {
            console.error(`Failed to sync ${file.name}:`, error);
            return false;
        }
    }

    /**
     * Remove file from rules directory
     */
    private removeFromRules(file: MemoryFile): void {
        const targetPath = path.join(this.getRulesDir(), file.name);
        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
            console.log(`Removed: ${file.name} from rules`);
        }
    }

    /**
     * Sync all enabled files
     */
    async syncAll(): Promise<{ synced: number; skipped: number }> {
        let synced = 0;
        let skipped = 0;

        for (const file of this.files.values()) {
            if (file.enabled) {
                const success = await this.syncFile(file);
                if (success) {
                    synced++;
                } else {
                    skipped++;
                }
            } else {
                skipped++;
            }
        }

        return { synced, skipped };
    }

    /**
     * Create a new memory file
     */
    async createFile(name: string): Promise<{ success: boolean; path?: string; error?: string }> {
        // Ensure .md extension
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        const memoryDir = this.getMemoryDir();

        // Create directory if needed
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }

        const filePath = path.join(memoryDir, fileName);

        // Check if file already exists
        if (fs.existsSync(filePath)) {
            return { success: false, error: `File ${fileName} already exists` };
        }

        // Create with template content
        const content = this.createTemplate(name.replace('.md', ''));

        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    /**
     * Add YAML frontmatter to content
     */
    private addFrontmatter(content: string, name: string): string {
        const frontmatter = `---
name: ${name}
description: Rule from memory - ${name}
---

`;
        return frontmatter + content;
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

\`\`\`markdown
Example usage or code snippets
\`\`\`
`;
    }
}
