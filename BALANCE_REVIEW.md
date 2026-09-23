# Progression rebalance — containment-2.1.0

Shots now pass through gates, allowing players to improve gates while killing the enemies behind them. This pass increases the strength of later encounters and makes permanent upgrades more useful against that curve.

## Changes

- The first 60 m retain their original strength and damage scaling.
- After 60 m, effective strength distance grows by 1.25 per meter. The previous curve delayed much of that growth until later bosses.
- Equipment-driven enemy HP and armor reach their full scaling at 270 m, instead of blending in a second, slower curve.
- Telegraph damage receives an additional multiplier: ×1 at 60 m, ×1.75 at 150 m, and ×3 from 300 m onward. Distance scaling continues beyond that point. For armies below 120, nominal attack damage is about twice the previous value at the first boss and four times the previous value at the second. Actual casualties still respect shield absorption and the number of soldiers exposed to the attack.
- Warnings retain their existing timing and snapshotted damage. Spawn spacing, movement, and route fairness are unchanged.
- Permanent bonuses per level: +20% starting army, +12% weapon damage, +8% kinetic fire rate. Permanent bonuses do not feed the adaptive equipment-strength calculation. The armory and the arsenal-copy super use these same values.
- Earnings: one credit per 4 m, plus 25 per defeated boss. A defeat at 250 m after one boss earns 87 credits; four such runs buy the first 300-credit upgrade. Practice runs still earn nothing. Prices and existing purchases are preserved.
- Replay version advances to `containment-2.1.0` because older inputs produce different outcomes under these rules.

## Paired automated runs

Six identical seeds (`difficulty-0` through `difficulty-5`) per upgrade tier, Classic mode, no super loadout, existing legal-speed bot, capped at 15 simulated minutes. Upgrade levels apply to all three permanent upgrades.

| Upgrade level | Previous median distance | New median distance | Previous median bosses defeated | New median bosses defeated |
| --- | ---: | ---: | ---: | ---: |
| 0 | 507 m | 300 m | 2.5 | 1 |
| 2 | 600 m | 426 m | 3 | 2 |
| 5 | 675 m | 571 m | 3.5 | 3 |

These are progression measurements, not human completion rates. Some runs reach the time limit while fighting a boss; those are explicitly recorded as cutoffs, not defeats or earned payouts. In the final sample, fresh characters hit the limit four times; each upgraded tier hits it twice. Seed variation and the bot's targeting limit conclusions about individual runs. Skillful play can still outperform the benchmark; there are no artificial upgrade locks.

Raw paired results are in `artifacts/difficulty-review.json`. Regression checks cover the new curve, attack commitment, upgrade benefits, early earnings, replay determinism, and reachable boss warnings across all modes.
