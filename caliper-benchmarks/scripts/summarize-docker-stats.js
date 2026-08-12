'use strict';

const fs = require('node:fs');
if (process.argv.length !== 6) {
    console.error('Usage: node scripts/summarize-docker-stats.js <raw.jsonl> <summary.csv> <scenario-id> <tx-load>');
    process.exit(2);
}
const [input, output, scenarioID, txLoad] = process.argv.slice(2);
const unitToMb = { B: 1 / 1e6, kB: 1 / 1000, KB: 1 / 1000, KiB: 1024 / 1e6, MB: 1, MiB: 1048576 / 1e6, GB: 1000, GiB: 1073741824 / 1e6 };
const memoryMb = (value) => {
    const used = String(value || '').split('/')[0].trim();
    const match = used.match(/^([0-9.]+)\s*([A-Za-z]+)$/);
    return match ? Number(match[1]) * (unitToMb[match[2]] || NaN) : NaN;
};
const grouped = new Map();
for (const line of fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line).stats;
    const name = row.Name || row.Container || row.ID;
    if (!grouped.has(name)) grouped.set(name, { cpu: [], memory: [] });
    const bucket = grouped.get(name);
    const cpu = Number(String(row.CPUPerc || '').replace('%', ''));
    const memory = memoryMb(row.MemUsage);
    if (Number.isFinite(cpu)) bucket.cpu.push(cpu);
    if (Number.isFinite(memory)) bucket.memory.push(memory);
}
const avg = (items) => items.length ? items.reduce((a, b) => a + b, 0) / items.length : '';
const peak = (items) => items.length ? Math.max(...items) : '';
const csv = ['container_name,cpu_avg_pct,cpu_peak_pct,memory_avg_mb,memory_peak_mb,scenario_id,tx_load'];
for (const [name, values] of [...grouped.entries()].sort()) csv.push([name, avg(values.cpu), peak(values.cpu), avg(values.memory), peak(values.memory), scenarioID, txLoad].join(','));
fs.writeFileSync(output, csv.join('\n') + '\n');
console.log(`Summarized ${grouped.size} containers`);
