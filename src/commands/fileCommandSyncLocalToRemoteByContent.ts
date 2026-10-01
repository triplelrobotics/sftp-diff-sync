import { COMMAND_SYNC_LOCAL_TO_REMOTE_BY_CONTENT } from '../constants';
import { sync2RemoteByContent } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { selectFolderFallbackToConfigContext, uriFromfspath, applySelector } from './shared';

export default checkFileCommand({
  id: COMMAND_SYNC_LOCAL_TO_REMOTE_BY_CONTENT,
  getFileTarget: applySelector(uriFromfspath, selectFolderFallbackToConfigContext),

  handleFile: sync2RemoteByContent,
});
