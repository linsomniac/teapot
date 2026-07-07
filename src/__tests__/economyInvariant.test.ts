import { describe, expect, it } from 'vitest';
import { paramsForLevel } from '../sim/difficultyCurve';
import { levelClearBonus } from '../sim/scoring';
import { makeLiveConfig } from './fixtures/liveConfig';

// Economy invariant (Task 12.5, §7/D20/D30): the maximum attainable
// tail-wave score — full budgets, Tanker-released Flippers, every Fuseball
// at the near-rim band, the capped clear bonus — stays BELOW the bonus-life
// interval, so bonus-life income can never outgrow the frozen difficulty
// tail and trend toward immortality. (Spike-trim points are excluded per
// the pinned formula; they are fire-rate-bounded and negligible — R3.)
// Runs against the LIVE data modules: any retuning must keep this green.

describe('economy invariant (§7/D30)', () => {
  it('max tail-wave score < bonusLifeInterval', () => {
    const cfg = makeLiveConfig();
    const sc = cfg.scoring;
    const lp = paramsForLevel(sc.clearBonusCapLevel, cfg.difficulty);

    const flippersTotal = lp.flipper + 2 * lp.tanker; // splits release 2 each
    const maxKills =
      flippersTotal * sc.flipper +
      lp.tanker * sc.tanker +
      lp.spiker * sc.spiker +
      lp.fuseball * Math.max(...sc.fuseballBands) +
      lp.pulsar * sc.pulsar;
    const maxWave = maxKills + levelClearBonus(sc.clearBonusCapLevel, sc);

    expect(maxWave).toBeLessThan(sc.bonusLifeInterval);
  });

  it('the tail is genuinely flat: every level beyond the cap yields the same maximum', () => {
    const cfg = makeLiveConfig();
    const capRow = paramsForLevel(
      cfg.scoring.clearBonusCapLevel,
      cfg.difficulty,
    );
    expect(paramsForLevel(150, cfg.difficulty)).toEqual(capRow);
    expect(levelClearBonus(150, cfg.scoring)).toBe(
      levelClearBonus(cfg.scoring.clearBonusCapLevel, cfg.scoring),
    );
  });
});
