import { execSync } from 'child_process';
import { CommitArgs } from '../types';

export enum GitStatus {
  /* eslint-disable no-unused-vars */
  NO_STAGED_CHANGES = 'NO_STAGED_CHANGES',
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export class GitManager {
  private static readonly MAX_CHANGES_PER_FILE = 500;
  private static readonly MAX_TOTAL_CHANGES = 5000;

  public static processCommitArgs(args: string[]): CommitArgs {
    const processedArgs: string[] = [];
    let skipNext = false;
    let prefix = '';

    for (const arg of args) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (arg === '-m' || arg === '--message') {
        skipNext = true;
      } else if (!arg.startsWith('-m') && !arg.startsWith('--message=')) {
        if (!prefix && !arg.startsWith('-')) {
          prefix = arg;
        } else {
          processedArgs.push(arg);
        }
      }
    }

    return { prefix, args: processedArgs };
  }

  public static getStagedChanges(): string | GitStatus {
    try {
      const files = execSync('git diff --cached --name-only').toString().trim().split('\n');

      if (files.length === 0 || (files.length === 1 && files[0] === '')) {
        return GitStatus.NO_STAGED_CHANGES;
      }

      let allChanges = '';
      let totalChangeCount = 0;
      let truncatedFiles = 0;

      // First pass: count total changes and identify large files
      for (const file of files) {
        const fileChanges = execSync(`git diff --cached -- "${file}"`).toString();
        const changeCount = fileChanges.split('\n').length;
        totalChangeCount += changeCount;

        if (changeCount > this.MAX_CHANGES_PER_FILE) {
          truncatedFiles++;
          allChanges += `[File: ${file} - Too many changes to display (${changeCount} lines)]\n`;
        } else {
          allChanges += `[File: ${file}]\n${fileChanges}\n\n`;
        }

        // If we exceed the max total changes, stop processing more files in detail
        if (totalChangeCount > this.MAX_TOTAL_CHANGES) {
          const remainingFiles = files.length - (files.indexOf(file) + 1);
          if (remainingFiles > 0) {
            allChanges += `\n[${remainingFiles} more files not shown due to size constraints]\n`;
            break;
          }
        }
      }

      // Add summary if files were truncated
      if (truncatedFiles > 0) {
        allChanges =
          `[${truncatedFiles} file(s) exceeded maximum line count and were truncated]\n\n` +
          allChanges;
      }

      return `Files changed:\n${files.join('\n')}\n\nChanges:\n${allChanges}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new GitError('Failed to get staged changes');
      }
      throw error;
    }
  }

  public static commit(message: string, args: string[] = []): void {
    try {
      const argsStr = args.length > 0 ? ' ' + args.join(' ') : '';
      execSync(`git commit -m "${message.replace(/"/g, '"')}"${argsStr}`, {
        stdio: 'inherit',
      });
    } catch (error: any) {
      // Print all available error output
      if (error && typeof error === 'object') {
        if ('stdout' in error && error.stdout) {
          process.stdout.write(error.stdout.toString());
        }
        if ('stderr' in error && error.stderr) {
          process.stderr.write(error.stderr.toString());
        }
      }
      // Print error message if nothing else
      if (error instanceof Error && error.message) {
        process.stderr.write(error.message + '\n');
      }
      const gitError = new GitError('Failed to commit changes');
      if (gitError.message) process.stdout.write(gitError.message + '\n');
      throw gitError;
    }
  }
}
