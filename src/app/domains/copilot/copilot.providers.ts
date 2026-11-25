import { Provider } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { LandmarkSource, TalkRepository } from './domain/conversation';
import { ChatModel } from './domain/copilot';
import { AnthropicChatModel } from './infrastructure/anthropic-chat.model';
import { ChosenChatModel, OpenAiChatModel } from './infrastructure/openai-chat.model';
import {
  IdbTalkRepository,
  WikipediaSource,
  copilotLegacyMigration,
} from './infrastructure/wikipedia.source';

export function provideCopilot(): Provider[] {
  return [
    AnthropicChatModel,
    OpenAiChatModel,
    { provide: ChatModel, useClass: ChosenChatModel },
    { provide: LandmarkSource, useClass: WikipediaSource },
    { provide: TalkRepository, useClass: IdbTalkRepository },
    { provide: LEGACY_MIGRATIONS, useValue: copilotLegacyMigration, multi: true },
  ];
}
