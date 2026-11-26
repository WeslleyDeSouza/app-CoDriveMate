import { InjectionToken } from '@angular/core';

export type ToolInput = Readonly<Record<string, unknown>>;

/** What a tool may ask of the copilot while it runs. */
export interface ToolContext {
  /** Asks the driver, spoken and on screen; true only on a clear yes. */
  confirm(question: string): Promise<boolean>;
}

/**
 * Something the copilot can do for the driver. Each domain brings its own tools
 * (`ASSISTANT_TOOLS`, multi provider); the copilot does not know the domains.
 */
export interface AssistantTool {
  /** snake_case, as the language model sees it */
  readonly name: string;
  /** for the language model, in English */
  readonly description: string;
  /** JSON schema of the input */
  readonly input: Readonly<Record<string, unknown>>;
  /**
   * Does it and says what came of it, in short English for the language model.
   * Only names and distances, never coordinates. Anything that changes something
   * the driver did not plainly ask for is confirmed first.
   */
  run(input: ToolInput, context: ToolContext): Promise<string>;
}

export const ASSISTANT_TOOLS = new InjectionToken<AssistantTool[]>('ASSISTANT_TOOLS');
