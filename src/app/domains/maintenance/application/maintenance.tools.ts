import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { DueLevel, DueStatus, inspectionDays } from '../domain/maintenance';
import { MaintenanceStore } from './maintenance.store';

/** The standard jobs carry no name of their own; the language model reads English. */
const STANDARD_NAMES: Readonly<Record<string, string>> = {
  service: 'service',
  oil: 'oil change',
  brake: 'brake fluid',
  plugs: 'spark plugs',
  belt: 'timing belt',
};
const INSPECTION = 'vehicle inspection (MFK)';
const VIGNETTE = 'motorway vignette';

function remaining(value: number, unit: string): string {
  const amount = Math.abs(Math.round(value));
  if (!amount) return `due now by ${unit === 'km' ? 'distance' : 'date'}`;
  return `${amount} ${unit} ${value < 0 ? 'over' : 'left'}`;
}

function itemText(name: string, { remainingKm, remainingDays }: DueStatus): string {
  const parts = [
    ...(remainingKm === null ? [] : [remaining(remainingKm, 'km')]),
    ...(remainingDays === null ? [] : [remaining(remainingDays, 'days')]),
  ];
  return parts.length ? `${name} (${parts.join(', ')})` : name;
}

/** The copilot says which jobs, the inspection or the vignette are due. Reads only. */
export function maintenanceStatusTool(): AssistantTool {
  const maintenance = inject(MaintenanceStore);
  return {
    name: 'maintenance_status',
    description:
      'Says which service jobs, the vehicle inspection (MFK) and the motorway vignette are ' +
      'overdue or due soon, and what comes up next, with the remaining km or days. ' +
      'Changes nothing.',
    input: { properties: {} },
    async run() {
      await maintenance.load();
      if (!maintenance.loaded()) return 'The maintenance plan could not be read.';

      const texts: Record<DueLevel, string[]> = { overdue: [], soon: [], ok: [], unknown: [] };
      const items = [...maintenance.items()].sort((a, b) => b.used - a.used);
      for (const { item, status } of items) {
        const name = item.name || STANDARD_NAMES[item.id] || 'job';
        texts[status.level].push(status.level === 'unknown' ? name : itemText(name, status));
      }
      // Only the job that comes up first is of interest among those that are fine.
      texts.ok.splice(1);

      const { inspectionDate, vignetteYear } = maintenance.plan();
      const days = inspectionDays(inspectionDate, Date.now());
      texts[maintenance.inspection()].push(
        days === null ? INSPECTION : `${INSPECTION} (${remaining(days, 'days')})`,
      );
      const vignette = maintenance.vignette();
      if (vignette === 'overdue') texts.overdue.push(`${VIGNETTE} ${vignetteYear} (expired)`);
      else if (vignette === 'soon') {
        texts.soon.push(`${VIGNETTE} ${vignetteYear} (valid until 31 January ${vignetteYear + 1})`);
      } else if (vignette === 'unknown') texts.unknown.push(VIGNETTE);

      const { overdue, soon, ok, unknown } = texts;
      return [
        overdue.length ? `Overdue: ${overdue.join('; ')}.` : '',
        soon.length ? `Due soon: ${soon.join('; ')}.` : '',
        overdue.length || soon.length ? '' : 'Nothing is due.',
        ok.length ? `Next: ${ok.join('; ')}.` : '',
        unknown.length ? `Not entered yet: ${unknown.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    },
  };
}
