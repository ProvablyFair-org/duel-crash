/**
 * Informational live-bet statistics (NOT scored — underpowered at n=1100).
 * Displayed after scored steps in a separate section.
 */

import type { VerifyContext, InfoItem } from './context';

export function run(ctx: VerifyContext): InfoItem[] {
  const info: InfoItem[] = [];
  const { rounds } = ctx;

  // Live-bet crash point distribution
  {
    const instantCrashes = rounds.filter(r => r.result.crashPoint === 1).length;
    const expectedInstant = rounds.length * 0.010891;
    info.push({
      label: 'Instant crash rate',
      detail: `${instantCrashes}/${rounds.length} (${(instantCrashes / rounds.length * 100).toFixed(2)}%) — expected ~${expectedInstant.toFixed(1)} (1.09%)`,
    });
  }

  // Live-bet RTP per cashout target
  {
    const byCashout = new Map<number, { wagered: number; returned: number; count: number }>();
    for (const r of rounds) {
      const target = r.request.auto_cashout;
      const amount = parseFloat(r.request.amount);
      const won = parseFloat(r.result.amountWon);
      const entry = byCashout.get(target) || { wagered: 0, returned: 0, count: 0 };
      entry.wagered += amount;
      entry.returned += r.result.isWin ? won : 0; // amountWon IS total payout (amount × cashout × 0.999)
      entry.count++;
      byCashout.set(target, entry);
    }

    for (const [target, data] of [...byCashout.entries()].sort((a, b) => a[0] - b[0])) {
      const rtp = data.wagered > 0 ? data.returned / data.wagered : 0;
      info.push({
        label: `Live RTP @ ${target}x (n=${data.count})`,
        detail: `${(rtp * 100).toFixed(2)}% — pre-rakeback display values (see MANIFEST §Money Model); small-n variance — informational only (simulation is authoritative)`,
      });
    }
  }

  // Win rate
  {
    const wins = rounds.filter(r => r.result.isWin).length;
    info.push({
      label: 'Overall win rate',
      detail: `${wins}/${rounds.length} (${(wins / rounds.length * 100).toFixed(2)}%)`,
    });
  }

  // Crash point range
  {
    const cps = rounds.map(r => r.result.crashPoint).sort((a, b) => a - b);
    info.push({
      label: 'Crash point range',
      detail: `min=${cps[0]}, median=${cps[Math.floor(cps.length / 2)]}, max=${cps[cps.length - 1]}`,
    });
  }

  return info;
}
