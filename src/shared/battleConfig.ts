export const BATTLE_CONFIG = {
  playerMonsterMaxHp: 30,
  kweenMaxHp: 100,
  kweenMaxShield: 20,
  kweenStartingShield: 20,
  kweenPattern: ["benchmark_brag", "score_surge", "royal_strike"],
  abilityValues: {
    soliHeal: 10,
    giptooDamageReduction: 10,
    coddyShieldRemoval: 15,
    coddyDirectDamage: 10,
    kweenShieldGain: 5,
    kweenRoyalStrikeDamage: 8,
  },
} as const;
