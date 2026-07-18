const TRUST_KEY = "card-space-trusted-keys";

interface TrustRecord {
  fingerprint: string; label: string;
  firstSeen: number; count: number; trusted: boolean;
}

function loadRecords(): Record<string, TrustRecord> {
  try { return JSON.parse(localStorage.getItem(TRUST_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveRecords(records: Record<string, TrustRecord>): void {
  localStorage.setItem(TRUST_KEY, JSON.stringify(records));
}

export function getTrustRecord(fp: string, label: string): TrustRecord {
  const records = loadRecords();
  if (!records[fp]) {
    records[fp] = { fingerprint: fp, label, firstSeen: Date.now(), count: 0, trusted: false };
  }
  records[fp].count++;
  records[fp].label = label;
  saveRecords(records);
  return records[fp];
}

export function setTrusted(fp: string, trusted: boolean): void {
  const records = loadRecords();
  if (records[fp]) { records[fp].trusted = trusted; saveRecords(records); }
}

export function getTrustedFingerprints(): Set<string> {
  const records = loadRecords();
  return new Set(Object.keys(records).filter((k) => records[k].trusted));
}
