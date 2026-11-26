import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { SCENES } from '../domain/lighting';
import { LightStore } from './light.store';

/** The copilot picks a light scene; while driving, the module stays dimmed as always. */
export function lightSceneTool(): AssistantTool {
  const light = inject(LightStore);
  const names = SCENES.map(({ name }) => name);
  return {
    name: 'set_light_scene',
    description:
      'Switches the interior lighting to a scene. While the car moves, the light is dimmed ' +
      'to the driving brightness anyway.',
    input: {
      properties: { scene: { type: 'string', enum: names } },
      required: ['scene'],
    },
    async run(input) {
      const scene = SCENES.find(({ name }) => name === input['scene']);
      if (!scene) return `Unknown scene. Known: ${names.join(', ')}.`;
      if (light.status() !== 'connected') return 'The light module is not connected.';
      light.apply(scene);
      return `Light scene "${scene.name}" is on.`;
    },
  };
}
