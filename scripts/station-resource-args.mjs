/** Parse the review tool's workload before it creates evidence directories or starts a browser. */
export function parseTrendRounds(args) {
  const flags = args.filter(arg => arg === '--rounds' || arg.startsWith('--rounds='));
  if (flags.length === 0) return 60;
  const value = flags[0].slice('--rounds='.length);
  const rounds = Number(value);
  if (flags.length !== 1 || !flags[0].startsWith('--rounds=') || value.trim() === '' || !Number.isSafeInteger(rounds) || rounds <= 0) {
    throw new Error('Invalid --rounds: use one --rounds=<positive safe integer> (default: 60).');
  }
  return rounds;
}
