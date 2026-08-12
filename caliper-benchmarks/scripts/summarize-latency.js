'use strict';

const fs = require('node:fs');

if (process.argv.length !== 4) {
    console.error('Usage: node scripts/summarize-latency.js <raw-latency.jsonl> <summary.json>');
    process.exit(2);
}
const [input, output] = process.argv.slice(2);
const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (!rows.length) throw new Error('No raw latency observations found');
const successful = rows.filter((row) => row.success).map((row) => Number(row.latency_s)).sort((a, b) => a - b);
const percentile = (values, p) => {
    if (!values.length) return null;
    const rank = Math.ceil((p / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(rank, values.length - 1))];
};
const summary = {
    observation_count: rows.length,
    success_count: successful.length,
    fail_count: rows.length - successful.length,
    success_rate_pct: (successful.length / rows.length) * 100,
    latency_avg_s: successful.length ? successful.reduce((sum, value) => sum + value, 0) / successful.length : null,
    latency_min_s: successful.length ? successful[0] : null,
    latency_max_s: successful.length ? successful[successful.length - 1] : null,
    latency_p50_s: percentile(successful, 50),
    latency_p95_s: percentile(successful, 95)
};
fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
