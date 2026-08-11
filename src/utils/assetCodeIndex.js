'use strict';

/**
 * AssetSpatial — Asset Coding / Indexing System
 * Format: FGN-{MDA}-{TYPE}-{BRANCH}-{YEAR}-{SEQ}
 *
 * Example: FGN-FMWH-INF-001-2024-0031
 *
 * Branch codes:
 *   001 = FCT / Abuja (always HQ)
 *   002–037 = States in alphabetical order
 */

// ── Branch code table ─────────────────────────────────────────────────────────
// 001 = FCT (HQ — always first, always Abuja)
// 002–037 = remaining 36 states alphabetically
const BRANCH_CODES = {
  'FCT':         '001',   // ← HQ — always 001
  'Abia':        '002',
  'Adamawa':     '003',
  'Akwa Ibom':   '004',
  'Anambra':     '005',
  'Bauchi':      '006',
  'Bayelsa':     '007',
  'Benue':       '008',
  'Borno':       '009',
  'Cross River': '010',
  'Delta':       '011',
  'Ebonyi':      '012',
  'Edo':         '013',
  'Ekiti':       '014',
  'Enugu':       '015',
  'Gombe':       '016',
  'Imo':         '017',
  'Jigawa':      '018',
  'Kaduna':      '019',
  'Kano':        '020',
  'Katsina':     '021',
  'Kebbi':       '022',
  'Kogi':        '023',
  'Kwara':       '024',
  'Lagos':       '025',
  'Nasarawa':    '026',
  'Niger':       '027',
  'Ogun':        '028',
  'Ondo':        '029',
  'Osun':        '030',
  'Oyo':         '031',
  'Plateau':     '032',
  'Rivers':      '033',
  'Sokoto':      '034',
  'Taraba':      '035',
  'Yobe':        '036',
  'Zamfara':     '037',
};

// Reverse lookup: branch code → state name
const BRANCH_TO_STATE = Object.fromEntries(
  Object.entries(BRANCH_CODES).map(([state, code]) => [code, state])
);

// ── Type short codes ──────────────────────────────────────────────────────────
const TYPE_CODES = {
  'Infrastructure':  'INF',
  'Land / Property': 'LND',
  'Utility':         'UTL',
  'Environmental':   'ENV',
  'Equipment':       'EQP',
  'Monument':        'MON',
  'Administrative Office': 'ADM',
  'Residential':           'RES',
  'Hospital':              'HOS',
  'School':                'SCH',
  'Laboratory':            'LAB',
  'Warehouse':             'WHS',
  'Court':                 'CRT',
  'Security Facility':     'SEC',
};

// ── Name abbreviation (v3) ────────────────────────────────────────────────────
// Derives a short, mnemonic abbreviation from an asset's own name — this is
// what makes a v3 code readable at a glance ("MSQ" for a Mosque) rather than
// just a category+number. Same style of algorithm as mdaToCode's fallback.
const NAME_STOPWORDS = new Set(['of','the','and','at','in','for','a','an','to','&']);

function nameToAbbr(name, maxLen = 4) {
  if (!name) return 'AST';
  const words = String(name)
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim().split(/\s+/).filter(Boolean)
    .filter(w => !NAME_STOPWORDS.has(w.toLowerCase()));
  if (!words.length) return 'AST';
  if (words.length === 1) return words[0].slice(0, maxLen).toUpperCase();
  const initials = words.map(w => w[0]).join('').toUpperCase();
  // Two-word names give only 2-letter initials (e.g. "Mathematics Set" →
  // "MS") — too short to be a useful mnemonic, so fall back to the first
  // word's own letters instead ("MATH"), which reads better.
  if (initials.length >= 3) return initials.slice(0, maxLen);
  return words[0].slice(0, maxLen).toUpperCase();
}

// ── MDA short code extractor ──────────────────────────────────────────────────
// Uses the MDA's shortName from mdaSeed if available (injected at runtime).
// Falls back to generating a 4-letter abbreviation from the MDA name.
function mdaToCode(mdaName, mdaList = []) {
  if (!mdaName) return 'FGN';

  // Try to find in seeded MDA list (passed from backend or cached on frontend)
  const found = mdaList.find(m =>
    m.name === mdaName || m.shortName === mdaName
  );
  if (found?.shortName) return found.shortName.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Fallback: extract uppercase letters from significant words
  const words = mdaName
    .replace(/\(.*?\)/g, '')          // remove parenthetical abbreviations
    .replace(/Federal Ministry of|Ministry of|Department of|Commission|Agency|Authority/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  // Take first letter of each word, up to 6 chars
  const code = words.map(w => w[0]).join('').toUpperCase();
  return code.slice(0, 6) || 'MDA';
}

// ── Branch code lookup ────────────────────────────────────────────────────────
function getBranchCode(state) {
  if (!state) return '000';
  return BRANCH_CODES[state] || '000';
}

function isHQ(branchCode) {
  return branchCode === '001';
}

function branchToState(branchCode) {
  return BRANCH_TO_STATE[branchCode] || 'Unknown';
}

// ── Sequence formatter ────────────────────────────────────────────────────────
function formatSeq(n) {
  return String(n).padStart(4, '0');
}

// ── Full code assembler (v3) ──────────────────────────────────────────────────
/**
 * Build the full structured asset code.
 * @param {object} opts
 * @param {string} opts.mda        - Full MDA name (e.g. "Federal Ministry of Works and Housing")
 * @param {string} opts.type       - Asset type (e.g. "Infrastructure")
 * @param {string} opts.name       - The asset's own name (e.g. "Mosque") — abbreviated into {NAME}
 * @param {string} opts.state      - Nigerian state (e.g. "Benue")
 * @param {number} opts.year       - Capture year (e.g. 2024)
 * @param {number} opts.seq        - Sequential number within this MDA+type+branch+year group
 * @param {Array}  opts.mdaList    - Optional list of MDA objects with shortName
 * @returns {string} e.g. "FGN-FMWH-INF-MOSQ-008-2024-0031"
 */
function buildAssetCode({ mda, type, name, state, year, seq, mdaList = [] }) {
  const mdaCode    = mdaToCode(mda, mdaList);
  const typeCode   = TYPE_CODES[type] || 'UNK';
  const nameCode   = nameToAbbr(name);
  const branch     = getBranchCode(state);
  const yr         = year || new Date().getFullYear();
  const seqStr     = formatSeq(seq || 1);
  return `FGN-${mdaCode}-${typeCode}-${nameCode}-${branch}-${yr}-${seqStr}`;
}

/**
 * Parse a structured asset code back into its components. Handles both the
 * current v3 shape (7 segments, with a {NAME} abbreviation) and the older v2
 * shape (6 segments, no name abbreviation) for compatibility with any code
 * that hasn't been through the v3 migration yet.
 * @param {string} code - e.g. "FGN-FMWH-INF-MOSQ-008-2024-0031"
 * @returns {object}
 */
function parseAssetCode(code) {
  if (!code) return null;
  // A v2 child code (base-6-segments + "-Cxx") also happens to total 7
  // dash-segments — the same count as a v3 BASE code. Without this guard,
  // a v2 child code would be silently mis-parsed as a v3 base code with
  // garbage field values. Child/inspection codes are never valid input to
  // this function — bail out immediately if the shape matches either.
  if (isChildCode(code) || isInspectionCode(code)) return null;

  const parts = code.split('-');
  if (parts.length === 7) {
    const [prefix, mda, type, name, branch, year, seq] = parts;
    return {
      prefix, mdaCode: mda, typeCode: type, nameCode: name,
      branchCode: branch, state: branchToState(branch), isHQ: isHQ(branch),
      year: parseInt(year, 10), seq: parseInt(seq, 10), version: 3, raw: code,
    };
  }
  if (parts.length === 6) {
    const [prefix, mda, type, branch, year, seq] = parts;
    return {
      prefix, mdaCode: mda, typeCode: type, nameCode: null,
      branchCode: branch, state: branchToState(branch), isHQ: isHQ(branch),
      year: parseInt(year, 10), seq: parseInt(seq, 10), version: 2, raw: code,
    };
  }
  return null;
}

// ── Child / secondary asset codes (v3.1) ─────────────────────────────────────
// Format: {PARENT CODE}-C{SEQ}-{PARENT ABBR}-{CHILD ABBR}
//   e.g. FGN-FMOE-EQP-MATH-025-2026-0007-C01-MATH-PENC
// The parent's own code is never modified. {PARENT ABBR} IS already present
// once, inside {PARENT CODE} itself — it's deliberately repeated here, right
// next to {CHILD ABBR}, so the parent/child connection is visible at a
// glance from the tail alone, without reading back through MDA/type/branch/
// year to find it. {PARENT ABBR} isn't a caller input — it's parsed straight
// out of parentCode, so it can never drift out of sync with the parent's
// actual code.
const CHILD_MARKER = 'C';

function formatChildSeq(n) {
  return String(n).padStart(2, '0');
}

/**
 * Build a child/component asset code from its parent's base code.
 * @param {object} opts
 * @param {string} opts.parentCode - the parent's own base FGN-... code
 * @param {number} opts.seq        - sequence among this parent's children (1-based)
 * @param {string} [opts.childName] - the child's own name, abbreviated into the code
 * @returns {string} e.g. "FGN-FMOE-EQP-MATH-025-2026-0007-C01-MATH-PENC"
 */
// ── Child / secondary asset codes (v3) ───────────────────────────────────────
// Format: {PARENT CODE}-C{SEQ}-{CHILD NAME}   e.g. FGN-FGN-INF-PSIN-001-2026-0001-C01-MOSQ
// The parent's own name abbreviation already appears once, at the start of
// {PARENT CODE} — that's enough for the connection to be visible at a
// glance; it doesn't need to be repeated again next to the child's own tag.
// (v3.1 briefly repeated it at the tail too; reverted once the real bug —
// linked assets whose code was never touched to reflect the link at all —
// was fixed and the parent abbreviation started showing up correctly on
// its own.)
function buildChildCode({ parentCode, seq, childName }) {
  if (!parentCode) return null;
  const base = `${parentCode}-${CHILD_MARKER}${formatChildSeq(seq || 1)}`;
  return childName ? `${base}-${nameToAbbr(childName)}` : base;
}

/**
 * True if `code` is a child/component code. Matches the current v3.1 shape
 * (-Cxx-PARENT-CHILD), the earlier v3.0 shape (-Cxx-CHILD only), and the
 * original v2 shape (-Cxx only) — anything that hasn't been through the
 * latest migration yet still parses correctly.
 */
function isChildCode(code) {
  return typeof code === 'string' && /-C\d{2,}(-[A-Z0-9]+){0,2}$/.test(code);
}

/**
 * Parse a child code back into its parent code, child sequence, and
 * whatever name abbreviation(s) are present in the tail.
 * @param {string} code - e.g. "FGN-FMOE-EQP-MATH-025-2026-0007-C01-MATH-PENC"
 * @returns {object|null} { parentCode, seq, parentAbbrInTail, nameCode, raw } or null
 */
function parseChildCode(code) {
  if (!isChildCode(code)) return null;
  const m = code.match(/^(.*)-C(\d{2,})((?:-[A-Z0-9]+){0,2})$/);
  if (!m) return null;
  const tailParts = m[3] ? m[3].slice(1).split('-') : [];
  // Two trailing segments = v3.1 (parent abbr + child abbr).
  // One trailing segment = v3.0 (child abbr only, no repeated parent abbr).
  // Zero = v2 (no name info at all).
  let parentAbbrInTail = null, nameCode = null;
  if (tailParts.length === 2) { [parentAbbrInTail, nameCode] = tailParts; }
  else if (tailParts.length === 1) { [nameCode] = tailParts; }
  return { parentCode: m[1], seq: parseInt(m[2], 10), parentAbbrInTail, nameCode, raw: code };
}

// ── Inspection visit codes ─────────────────────────────────────────────────────
// Format: {ASSET CODE}-INSP-{VISIT}   e.g. FGN-FMWH-INF-008-2026-0031-INSP-01
// Derived and stored on the Inspection record itself, never written back
// onto the asset's own code — the asset's base (or child) code stays
// permanent. The initial field capture never generates a visit code; the
// counter only starts once a formal follow-up inspection is Approved (see
// routes/inspection_routes.js POST /:id/approve).
const INSPECTION_MARKER = 'INSP';

function formatVisitSeq(n) {
  return String(n).padStart(2, '0');
}

/**
 * Build a derived inspection-visit code.
 * @param {object} opts
 * @param {string} opts.assetCode - the asset's own base (or child) code
 * @param {number} opts.visitSeq  - which visit this is for this specific asset (1-based)
 * @returns {string} e.g. "FGN-FMWH-INF-008-2026-0031-INSP-01"
 */
function buildInspectionCode({ assetCode, visitSeq }) {
  if (!assetCode) return null;
  return `${assetCode}-${INSPECTION_MARKER}-${formatVisitSeq(visitSeq || 1)}`;
}

function isInspectionCode(code) {
  return typeof code === 'string' && new RegExp(`-${INSPECTION_MARKER}-\\d{2,}$`).test(code);
}

/**
 * Parse an inspection code back into its asset code + visit number.
 * @param {string} code - e.g. "FGN-FMWH-INF-008-2026-0031-INSP-01"
 * @returns {object|null} { assetCode, visitSeq, raw } or null if not an inspection code
 */
function parseInspectionCode(code) {
  if (!isInspectionCode(code)) return null;
  const m = code.match(new RegExp(`^(.*)-${INSPECTION_MARKER}-(\\d{2,})$`));
  if (!m) return null;
  return { assetCode: m[1], visitSeq: parseInt(m[2], 10), raw: code };
}

// ── Exports ───────────────────────────────────────────────────────────────────
// Works as both a Node.js CommonJS module and a browser global
const AssetCodeIndex = {
  BRANCH_CODES,
  BRANCH_TO_STATE,
  TYPE_CODES,
  mdaToCode,
  nameToAbbr,
  getBranchCode,
  isHQ,
  branchToState,
  buildAssetCode,
  parseAssetCode,
  formatSeq,
  buildChildCode,
  parseChildCode,
  isChildCode,
  formatChildSeq,
  buildInspectionCode,
  parseInspectionCode,
  isInspectionCode,
  formatVisitSeq,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AssetCodeIndex;
} else {
  window.AssetCodeIndex = AssetCodeIndex;
}