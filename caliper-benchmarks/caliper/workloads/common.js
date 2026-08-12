'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function required(value, name) {
    if (value === undefined || value === null || value === '') {
        throw new Error(`Missing required workload argument: ${name}`);
    }
    return value;
}

function loadFixtures(workspaceRoot, fixturePath) {
    const absolute = path.resolve(workspaceRoot || process.cwd(), required(fixturePath, 'fixturesFile'));
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function fixtureAt(items, workerIndex, txIndex, label) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error(`Fixture pool ${label} is empty`);
    }
    return items[(workerIndex + txIndex) % items.length];
}

function deterministicHex(...parts) {
    return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
}

function request(contractFunction, invokerIdentity, contractArguments, readOnly = false) {
    return {
        contractId: 'basic',
        contractFunction,
        invokerIdentity,
        contractArguments: contractArguments.map(String),
        readOnly
    };
}

async function timedSend(adapter, fabricRequest, args, metadata = {}) {
    const started = process.hrtime.bigint();
    let success = false;
    let errorMessage = null;
    try {
        const result = await adapter.sendRequests(fabricRequest);
        success = true;
        return result;
    } catch (error) {
        errorMessage = error && error.message ? error.message : String(error);
        throw error;
    } finally {
        if (args.rawLatencyFile) {
            const ended = process.hrtime.bigint();
            const output = path.resolve(args.workspaceRoot || process.cwd(), args.rawLatencyFile);
            fs.mkdirSync(path.dirname(output), { recursive: true });
            fs.appendFileSync(output, JSON.stringify({
                timestamp: new Date().toISOString(),
                operation: fabricRequest.contractFunction,
                success,
                latency_s: Number(ended - started) / 1e9,
                error: errorMessage,
                ...metadata
            }) + '\n');
        }
    }
}

module.exports = { required, loadFixtures, fixtureAt, deterministicHex, request, timedSend };
