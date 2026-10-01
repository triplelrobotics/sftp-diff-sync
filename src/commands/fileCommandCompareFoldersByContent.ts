import { Uri, window, ProgressLocation, CancellationToken } from 'vscode';
import { COMMAND_COMPARE_FOLDERS_BY_CONTENT } from '../constants';
import { FileType } from '../core';
import { compareFoldersByContent, diff } from '../fileHandlers';
import { CompareResult, CompareStatus } from '../fileHandlers/compareFolders';
import { checkFileCommand } from './abstract/createCommand';
import { selectFolderFallbackToConfigContext, uriFromfspath, applySelector } from './shared';

const STATUS_LABEL: { [key in CompareStatus]: string } = {
  modified: '$(diff-modified) Modified',
  localOnly: '$(diff-added) Local only',
  remoteOnly: '$(diff-removed) Remote only',
  same: '$(check) Identical',
  error: '$(warning) Error / Unreadable',
};

async function showResults(results: CompareResult[]): Promise<void> {
  const visible = results.filter(r => r.status !== 'same');
  if (visible.length === 0) {
    window.showInformationMessage('Compare Folders by Content: local and remote are identical.');
    return;
  }

  const modifiedFiles = visible.filter(
    result => result.status === 'modified' && result.type !== FileType.Directory
  );
  const items: Array<
    | {
        itemType: 'openAll';
        label: string;
        description: string;
        detail: string;
        results: CompareResult[];
      }
    | {
        itemType: 'result';
        label: string;
        description: string;
        detail: string | undefined;
        result: CompareResult;
      }
  > = [];

  if (modifiedFiles.length > 0) {
    items.push({
      itemType: 'openAll',
      label: '$(diff) Open All Modified Diffs',
      description: `${modifiedFiles.length} file(s)`,
      detail: 'Open every modified file in its own side-by-side diff tab.',
      results: modifiedFiles,
    });
  }

  items.push(
    ...visible.map(result => ({
      itemType: 'result' as const,
      label: `${STATUS_LABEL[result.status]}  ${result.relativePath}`,
      description: result.type === FileType.Directory ? '(folder)' : '',
      detail: result.error,
      result,
    }))
  );

  const picked = await window.showQuickPick(items, {
    placeHolder: `${visible.length} content difference(s) found. Select a modified file to diff...`,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked) {
    return;
  }

  if (picked.itemType === 'openAll') {
    await openAllModifiedDiffs(picked.results);
    return;
  }

  await showActionsForResult(picked.result, results);
}

async function openAllModifiedDiffs(results: CompareResult[]): Promise<void> {
  const failed: string[] = [];
  let opened = 0;
  let cancelled = false;

  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Opening modified file diffs...',
      cancellable: true,
    },
    async (progress, token) => {
      for (const result of results) {
        if (token.isCancellationRequested) {
          cancelled = true;
          break;
        }

        progress.report({
          message: `${opened + failed.length + 1}/${results.length} ${result.relativePath}`,
          increment: 100 / results.length,
        });

        try {
          await diff(Uri.file(result.localFsPath), { preview: false, preserveFocus: true });
          opened += 1;
        } catch (_error) {
          failed.push(result.relativePath);
        }
      }
    }
  );

  if (failed.length > 0) {
    window.showWarningMessage(
      `Opened ${opened} of ${results.length} modified diffs. Failed: ${failed.join(', ')}`
    );
  } else if (cancelled) {
    window.showInformationMessage(`Stopped after opening ${opened} of ${results.length} diffs.`);
  }
}

async function showActionsForResult(result: CompareResult, results: CompareResult[]): Promise<void> {
  if (result.status === 'error') {
    window.showWarningMessage(
      `Compare Folders by Content: ${result.relativePath} could not be read: ${result.error}`
    );
    await showResults(results);
    return;
  }

  if (result.status !== 'modified' || result.type === FileType.Directory) {
    await showResults(results);
    return;
  }

  const pickedAction = await window.showQuickPick(
    [
      {
        label: '$(diff) Open Diff',
        action: () => diff(Uri.file(result.localFsPath)),
      },
      { label: '$(arrow-left) Back to list', action: () => showResults(results) },
    ],
    { placeHolder: result.relativePath }
  );

  if (pickedAction) {
    await pickedAction.action();
  }
}

export default checkFileCommand({
  id: COMMAND_COMPARE_FOLDERS_BY_CONTENT,
  getFileTarget: applySelector(uriFromfspath, selectFolderFallbackToConfigContext),

  async handleFile(ctx) {
    let cancelToken: CancellationToken | undefined;
    const results = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Comparing local and remote folders by content...',
        cancellable: true,
      },
      (_progress, token) => {
        cancelToken = token;
        return compareFoldersByContent(ctx, { isCancelled: () => token.isCancellationRequested });
      }
    );

    if (cancelToken && cancelToken.isCancellationRequested) {
      return;
    }

    await showResults(results);
  },
});
