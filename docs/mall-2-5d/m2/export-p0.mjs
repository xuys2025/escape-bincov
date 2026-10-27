// Backwards-compatible P0 entry; all batches share one deterministic exporter.
process.argv[2] = 'p0';
await import('./export-m2.mjs');
