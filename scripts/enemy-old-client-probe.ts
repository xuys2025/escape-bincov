/** Fixed historical implementations, never imports mutable current src modules.
 * Run: node --import tsx scripts/enemy-old-client-probe.ts [--candidate file.json]...
 * Evidence is local under ignored test-results/enemy-old-client-probe/.
 * Without candidates, version sentinels prove protocol gates; they do not claim
 * that the future enemy schema has already been implemented or validated.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'test-results', 'enemy-old-client-probe');
const versions = ['35b3a38223a7bb0020db25e9b2d0bb5476caa993', '76adbd627f582d063cc6f80a4551e8b8cbe2dddd',
    'dc14ad5c38008d36392ad2cf02a73a2badc51d87', '8b6192d9987b6e65dc458095f690cd6e017e7d23',
    '174341b02c6c3efe32fbd7f0151473b97ec42812', '71cf986e620de38eaf5b3ca015fa52cacb47923f',
    '1b884f29d4a137b4dd7a7e392ec8c5072cdd51f5'];
const NOW = 1800000000000;
const SESSION_ERROR = '无法读取这份存档。请导出原始备份后使用兼容版本，当前进度未被覆盖。';
const EXPANSION_ERROR = '建筑、角色或基地存档损坏或版本不兼容。原始数据已保留。';
const NOT_LOADED = '存档未就绪或另一窗口正在使用。';
const ENVELOPE_ERROR = '此备份来自不兼容的版本，请使用兼容版本导入。';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const args = process.argv.slice(2), candidatePaths: string[] = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--candidate' || !args[i + 1]) throw new Error('Usage: node --import tsx scripts/enemy-old-client-probe.ts [--candidate file.json]...');
    candidatePaths.push(resolve(args[++i]));
}
mkdirSync(evidence, { recursive: true });
const results: object[] = [];

function memory(key: string, initial?: string) {
    const data = new Map<string, string>(initial === undefined ? [] : [[key, initial]]);
    let writes = 0;
    return { data, get writes() { return writes; }, storage: {
        getItem: (name: string) => data.get(name) ?? null,
        setItem: (name: string, value: string) => { writes++; data.set(name, value); },
    } };
}
function rejects(fn: () => unknown, message: string) {
    assert.throws(fn, { name: 'Error', message });
}

for (const revision of versions) {
    const recent = versions.indexOf(revision) >= 2;
    const supportedSessions = versions.indexOf(revision)>=4 ? [2,3,4,5,6,7]
        : recent ? [2, 3, 4, revision.startsWith('dc14ad5') ? 6 : 5] : [2, 3, 4];
    assert.equal(git('rev-parse', revision), revision);
    const client = join(evidence, revision.slice(0, 7)), sourceHashes: Record<string, string> = {};
    // Extract only explicit tracked source files and one historical fixture; no
    // worktree dependencies, credentials, generated HTML, or user files are copied.
    const paths = git('ls-tree', '-r', '--name-only', revision, '--', 'src', 'tests/fixtures/layered.ts')
        .split('\n').filter(path => path.endsWith('.ts'));
    const batch = execFileSync('git', ['cat-file', '--batch'], { cwd: root,
        input: paths.map(path => `${revision}:${path}\n`).join(''), maxBuffer: 64 * 1024 * 1024 });
    let offset = 0;
    for (const path of paths) {
        const end = batch.indexOf(10, offset), header = batch.subarray(offset, end).toString('utf8');
        const match = /^([a-f0-9]{40}) blob ([0-9]+)$/.exec(header);
        assert.ok(match, `expected tracked source blob: ${revision}:${path}`);
        const size = Number(match[2]), bytes = batch.subarray(end + 1, end + 1 + size);
        assert.equal(createHash('sha1').update(`blob ${size}\0`).update(bytes).digest('hex'), match[1]);
        offset = end + size + 2;
        const target = join(client, path);
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
        sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
    }
    assert.equal(offset, batch.length);
    const load = (path: string) => import(pathToFileURL(join(client, path)).href);
    const [R, S, B, D, F] = await Promise.all([
        load('src/recovery-store.ts'), load('src/session.ts'), load('src/save-backup.ts'),
        load('src/domain.ts'), load('tests/fixtures/layered.ts'),
    ]);
    const fixtures: { name: string; record: any; resolver?: any }[] = [];
    for (const route of ['base', 'classic', 'buildings', 1, 2, 3] as const) {
        const m = memory(R.SESSION_KEY), state = S.createSessionState();
        const saves = new S.SaveSession(state, () => m.storage, undefined, () => NOW);
        assert.equal(saves.initialize(), true, state.storageError);
        state.state = 'hideout';
        if (route !== 'base') assert.equal(saves.beginRun(42, route === 'classic' ? false : route === 'buildings' ? true : 'mall',
            typeof route === 'number' ? { mallLayout: route } : {}), true, state.storageError);
        fixtures.push({ name: String(route), record: saves.currentRecord() });
    }
    // A real version-1 fixture has no v2-only keys. Changing only its version to 3
    // reaches the historical version check rather than merely the key whitelist.
    const world = F.prototypeWorld(), resolver = (version: string) => version === world.id ? world : undefined;
    const profile = D.newSave(), expansion = F.prototypeRaid(profile, world);
    const initial = memory(R.SESSION_KEY), store = new R.RecoveryStore(initial.storage, () => NOW, resolver);
    store.load(); const v1 = store.commit(profile, null, null, expansion);
    fixtures.push({ name: 'prototype-layer1', record: v1, resolver });

    function positive(name: string, record: any, resolveWorld?: any) {
        const raw = JSON.stringify(record, null, 2) + '\n';
        assert.deepEqual(R.decodeSession(raw, resolveWorld), record);
        const envelope = B.encodeRecoveryBackup(record, resolveWorld);
        assert.deepEqual(B.decodePortableBackup(envelope, resolveWorld), { kind: 'session', record });
        const m = memory(R.SESSION_KEY, raw), recovery = new R.RecoveryStore(m.storage, () => NOW, resolveWorld);
        recovery.load(); assert.deepEqual(recovery.record, record); assert.equal(recovery.original(), raw);
        const state = S.createSessionState(), saves = new S.SaveSession(state, () => m.storage, resolveWorld, () => NOW);
        assert.equal(saves.initialize(), true, `${name}: ${state.storageError}`);
        assert.equal(saves.persist(), true, state.storageError); assert.equal(m.writes, 2);
        assert.equal(saves.revision, record.revision + 2);
        for (const field of ['legacyBackup', 'migrationBackup', 'systemsBackup', 'enemyBackup', 'perksBackup'])
            assert.equal(saves.currentRecord()[field], record[field], `positive ${name}: preserve embedded ${field}`);
        writeFileSync(join(client, `${name}-valid.json`), raw);
        results.push({ client: revision, case: `${name}-positive`, reads: true, initializes: true, persists: true,
            writes: m.writes, sourceSha256: sha256(raw), backupRoundTrip: true });
    }
    function negative(name: string, raw: string, expected: string, resolveWorld?: any) {
        const parsed = JSON.parse(raw);
        rejects(() => R.decodeSession(raw, resolveWorld), expected);
        // Raw-session and portable-envelope import both reject, with the precise
        // compatibility errors, rather than counting an arbitrary thrown error.
        rejects(() => B.decodePortableBackup(raw, resolveWorld), expected);
        rejects(() => B.decodePortableBackup(JSON.stringify({ format: 'escape-bincov-recovery-backup',
            formatVersion: parsed.version, record: parsed }), resolveWorld), !supportedSessions.includes(parsed.version) ? ENVELOPE_ERROR : expected);
        const m = memory(R.SESSION_KEY, raw), recovery = new R.RecoveryStore(m.storage, () => NOW, resolveWorld);
        rejects(() => recovery.load(), expected);
        assert.equal(recovery.record, null); assert.equal(recovery.original(), raw);
        // Even direct RecoveryStore use after load failure cannot overwrite.
        rejects(() => recovery.commit(D.newSave(), null), NOT_LOADED);
        const state = S.createSessionState(), saves = new S.SaveSession(state, () => m.storage, resolveWorld, () => NOW);
        assert.equal(saves.initialize(), false); assert.equal(state.storageError, expected);
        assert.equal(saves.currentRecord(), null); assert.equal(saves.revision, 0);
        assert.equal(saves.persist(), false); assert.equal(state.storageError, NOT_LOADED);
        assert.equal(saves.persist(), false); assert.equal(saves.original(), raw);
        assert.equal(m.data.get(R.SESSION_KEY), raw); assert.equal(m.writes, 0);
        // Raw backup is a byte-for-byte copy of original(), never parsed and
        // reserialized. Whitespace and all embedded historical backups survive.
        const file = join(client, `${name}-rejected-original.json`);
        writeFileSync(file, saves.original()); assert.equal(readFileSync(file, 'utf8'), raw);
        const targetMemory = memory(R.SESSION_KEY), targetState = S.createSessionState();
        const target = new S.SaveSession(targetState, () => targetMemory.storage, resolveWorld, () => NOW);
        assert.equal(target.initialize(), true, targetState.storageError);
        const before = targetMemory.data.get(R.SESSION_KEY), writesBefore = targetMemory.writes;
        // The public import path validates before calling the typed internal importRecord API.
        rejects(() => target.importRecord(B.decodePortableBackup(raw, resolveWorld).record), expected);
        if (!recent) assert.equal(target.importRecord(parsed), false);
        assert.equal(targetMemory.data.get(R.SESSION_KEY), before); assert.equal(targetMemory.writes, writesBefore);
        results.push({ client: revision, case: name, expectedError: expected, rejectedRead: true,
            rejectedInitialize: true, rejectedDirectCommit: true, rejectedPersistAttempts: 2,
            rejectedImport: true, writes: m.writes, originalSha256: sha256(raw), rawBackupPreserved: true,
            embeddedBackups: ['legacyBackup', 'migrationBackup', 'systemsBackup', 'enemyBackup', 'perksBackup'].filter(key => typeof parsed[key] === 'string') });
    }
    for (const fixture of fixtures) {
        positive(fixture.name, fixture.record, fixture.resolver);
        negative(`${fixture.name}-session${recent ? 99 : 5}`, JSON.stringify({ ...fixture.record, version: recent ? 99 : 5 }, null, 2) + '\n', SESSION_ERROR, fixture.resolver);
        if (fixture.record.expansion?.raid) {
            const candidate = structuredClone(fixture.record); candidate.expansion.raid.version = recent ? 99 : 3;
            negative(`${fixture.name}-layer${recent ? 99 : 3}`, JSON.stringify(candidate, null, 2) + '\n', EXPANSION_ERROR, fixture.resolver);
        }
    }
    for (const [index, path] of candidatePaths.entries()) {
        const supplied = readFileSync(path, 'utf8'), envelope = JSON.parse(supplied);
        const raw = envelope.format === 'escape-bincov-recovery-backup' ? JSON.stringify(envelope.record, null, 2) + '\n' : supplied;
        const parsed = JSON.parse(raw);
        assert.ok(!supportedSessions.includes(parsed.version) || [3, 4, 5].includes(parsed.expansion?.raid?.version), 'candidate must use a new protocol version');
        negative(`candidate-${index}`, raw, !supportedSessions.includes(parsed.version) ? SESSION_ERROR : EXPANSION_ERROR);
    }
    writeFileSync(join(client, 'source-hashes.json'), JSON.stringify({ revision, sourceHashes }, null, 2) + '\n');
}
const report = { generatedAt: new Date().toISOString(), node: process.version,
    scope: 'Real fixed historical readers/writers. Built-in fixtures are protocol sentinels; optional supplied candidates require separate new-client validity evidence.',
    versions, candidatePaths, cases: results.length, results };
writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ evidence, versions, cases: results.length, candidates: candidatePaths.length, status: 'PASS' }, null, 2));
