import type { PowChallenge } from '../types.ts'
import { getProtocolCoreSync, loadProtocolCore } from '../protocol/core.ts'

export function powResponseJson(
  challenge: PowChallenge,
  answer: number,
  target: 'completion' | 'upload_attachment' = 'completion',
): string {
  const header = encodePowHeader(challenge, answer, target)
  return Buffer.from(header, 'base64').toString('utf8')
}

export function encodePowHeader(
  challenge: PowChallenge,
  answer: number,
  target: 'completion' | 'upload_attachment' = 'completion',
): string {
  return getProtocolCoreSync().encodePowHeader(challenge, answer, target)
}

export async function encodePowHeaderAsync(
  challenge: PowChallenge,
  answer: number,
  target: 'completion' | 'upload_attachment' = 'completion',
): Promise<string> {
  const core = await loadProtocolCore()
  return core.encodePowHeader(challenge, answer, target)
}
