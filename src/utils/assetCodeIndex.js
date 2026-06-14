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
};

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

// ── Full code assembler ───────────────────────────────────────────────────────
/**
 * Build the full structured asset code.
 * @param {object} opts
 * @param {string} opts.mda        - Full MDA name (e.g. "Federal Ministry of Works and Housing")
 * @param {string} opts.type       - Asset type (e.g. "Infrastructure")
 * @param {string} opts.state      - Nigerian state (e.g. "Benue")
 * @param {number} opts.year       - Capture year (e.g. 2024)
 * @param {number} opts.seq        - Sequential number within this MDA+type+branch+year group
 * @param {Array}  opts.mdaList    - Optional list of MDA objects with shortName
 * @returns {string} e.g. "FGN-FMWH-INF-008-2024-0031"
 */
function buildAssetCode({ mda, type, state, year, seq, mdaList = [] }) {
  const mdaCode    = mdaToCode(mda, mdaList);
  const typeCode   = TYPE_CODES[type] || 'UNK';
  const branch     = getBranchCode(state);
  const yr         = year || new Date().getFullYear();
  const seqStr     = formatSeq(seq || 1);
  return `FGN-${mdaCode}-${typeCode}-${branch}-${yr}-${seqStr}`;
}

/**
 * Parse a structured asset code back into its components.
 * @param {string} code - e.g. "FGN-FMWH-INF-008-2024-0031"
 * @returns {object}
 */
function parseAssetCode(code) {
  if (!code) return null;
  const parts = code.split('-');
  if (parts.length < 6) return null;
  const [prefix, mda, type, branch, year, seq] = parts;
  return {
    prefix,
    mdaCode:    mda,
    typeCode:   type,
    branchCode: branch,
    state:      branchToState(branch),
    isHQ:       isHQ(branch),
    year:       parseInt(year, 10),
    seq:        parseInt(seq, 10),
    raw:        code,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────
// Works as both a Node.js CommonJS module and a browser global
const AssetCodeIndex = {
  BRANCH_CODES,
  BRANCH_TO_STATE,
  TYPE_CODES,
  mdaToCode,
  getBranchCode,
  isHQ,
  branchToState,
  buildAssetCode,
  parseAssetCode,
  formatSeq,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AssetCodeIndex;
} else {
  window.AssetCodeIndex = AssetCodeIndex;
}