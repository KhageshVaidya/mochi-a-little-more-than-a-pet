import { SignalDefinition } from '@orbital/contracts';
import { SIGNALS, type RegisteredSignalId } from './registry';

export { SIGNALS, type RegisteredSignalId };

const byId = new Map<string, SignalDefinition>(SIGNALS.map((s) => [s.id, SignalDefinition.parse(s)]));

/** Returns the parsed definition, or undefined for unknown ids (never throws). */
export function getSignal(id: string): SignalDefinition | undefined {
  return byId.get(id);
}

export function allSignals(): SignalDefinition[] {
  return [...byId.values()];
}

export function brainProfileSignals(): SignalDefinition[] {
  return allSignals().filter((s) => s.brainProfile);
}
