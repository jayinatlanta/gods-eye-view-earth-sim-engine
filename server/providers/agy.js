import { handleAgyVoiceCommand } from './agy/voice-command.js';
import {
  handleAgyModels,
  handleAgySelfModify,
  handleAgySelfModifyRevert,
  handleAssistantCapabilities,
} from './agy/self-modify.js';

function agyProxy() {
  function install(middlewares) {
    middlewares.use('/api/assistant/capabilities', handleAssistantCapabilities);
    middlewares.use('/api/agy/models', handleAgyModels);
    middlewares.use('/api/agy/voice-command', handleAgyVoiceCommand);
    middlewares.use('/api/agy/self-modify/revert', handleAgySelfModifyRevert);
    middlewares.use('/api/agy/self-modify', handleAgySelfModify);
  }

  return {
    name: 'agy-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

export { agyProxy };
