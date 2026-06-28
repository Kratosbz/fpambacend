/**
 * recode_assets.js
 * ================
 * Migrates all scraped FGN-FGN-BLD-* assets to the proper naming convention:
 *   FGN-{MDA_CODE}-{TYPE}-{BRANCH}-{YEAR}-{SEQUENCE}
 * Also sets condition "Unknown" → "Good"
 *
 * Run from your backend folder:
 *   node recode_assets.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME   = 'assetspatial';
const COL       = 'assets';

// ── BRANCH CODES (state → code) ──────────────────────────────────────────────
const STATE_CODES = {
  'fct': '001', 'abuja': '001', 'fct, abuja': '001', 'fct abuja': '001',
  'abia': '002',
  'adamawa': '003',
  'akwa ibom': '004', 'akwa-ibom': '004',
  'anambra': '005',
  'bauchi': '006',
  'bayelsa': '007',
  'benue': '008',
  'borno': '009',
  'cross river': '010', 'cross-river': '010',
  'delta': '011',
  'ebonyi': '012',
  'edo': '013',
  'ekiti': '014',
  'enugu': '015',
  'gombe': '016',
  'imo': '017',
  'jigawa': '018',
  'kaduna': '019',
  'kano': '020',
  'katsina': '021', 'kastina': '021',
  'kebbi': '022',
  'kogi': '023',
  'kwara': '024',
  'lagos': '025',
  'nasarawa': '026', 'nasarrawa': '026',
  'niger': '027',
  'ogun': '028',
  'ondo': '029',
  'osun': '030',
  'oyo': '031',
  'plateau': '032',
  'rivers': '033', 'river': '033',
  'sokoto': '034',
  'taraba': '035',
  'yobe': '036',
  'zamfara': '037',
};

// ── MDA NAME → SHORT CODE ─────────────────────────────────────────────────────
// Derives a 3-6 char code from the MDA name
function mdaCode(name) {
  if (!name) return 'FGN';
  const n = name.toUpperCase().trim();

  // Known mappings
  const known = {
    'FEDERAL MINISTRY OF AGRICULTURE':              'FMARD',
    'FEDERAL MINISTRY OF AGRICULTURE AND RURAL':    'FMARD',
    'FEDERAL MINISTRY OF LABOUR':                   'FMLE',
    'FEDERAL MINISTRY OF HEALTH':                   'FMOH',
    'FEDERAL MINISTRY OF EDUCATION':                'FMOE',
    'FEDERAL MINISTRY OF WORKS':                    'FMWH',
    'FEDERAL MINISTRY OF FINANCE':                  'FMOF',
    'FEDERAL MINISTRY OF ENVIRONMENT':              'FMENV',
    'FEDERAL MINISTRY OF COMMUNICATION':            'FMCDE',
    'FEDERAL MINISTRY OF POWER':                    'FMP',
    'FEDERAL MINISTRY OF MINES':                    'FMMSD',
    'FEDERAL MINISTRY OF JUSTICE':                  'FMJ',
    'FEDERAL MINISTRY OF FOREIGN AFFAIRS':          'FMFA',
    'FEDERAL MINISTRY OF TRANSPORT':                'FMT',
    'FEDERAL MINISTRY OF DEFENCE':                  'FMOD',
    'FEDERAL MINISTRY OF HOUSING':                  'FMHUD',
    'NIGERIA POSTAL SERVICE':                       'NIPOST',
    'NIGERIA COMMUNICATION':                        'NCC',
    'NIGERIA COMMUNICATION SATELLITE':              'NIGCOMSAT',
    'NATIONAL INFORMATION TECHNOLOGY':              'NITDA',
    'FEDERAL ROADS SAFETY CORPS':                   'FRSC',
    'JOINT ADMISSIONS MATRICULATION BOARD':         'JAMB',
    'INDEPENDENT CORRUPT PRACTICES':                'ICPC',
    'ECONOMIC AND FINANCIAL CRIMES':                'EFCC',
    'INEC':                                         'INEC',
    'UNIVERSITY OF':                                'UNIV',
    'BAYERO UNIVERSITY':                            'BUK',
    'AHMADU BELLO UNIVERSITY':                      'ABU',
    'FEDERAL POLYTECHNIC':                          'FPOLY',
    'FEDERAL GOVERNMENT COLLEGE':                   'FGC',
    'FEDERAL GOVERNMENT GIRLS COLLEGE':             'FGGC',
    'FEDERAL TECHNICAL COLLEGE':                    'FTC',
    'FEDERAL MORTGAGE BANK':                        'FMBN',
    'NIGERIA DEPOSIT INSURANCE':                    'NDIC',
    'UNIVERSAL BASIC EDUCATION':                    'UBEC',
    'BANK OF AGRICULTURE':                          'BOA',
    'STRATEGIC GRAINS RESERVE':                     'SGR',
    'RADIOGRAPHERS REGISTRATION BOARD':             'RRB',
    'COMMUNITY HEALTH PRACTITIONERS':               'CHPRBN',
    'NATIONAL HEALTH INSURANCE':                    'NHIS',
    'NATIONAL EAR CARE CENTER':                     'NECC',
    'POST HEALTH SERVICES':                         'PHS',
    'NATIONAL PRIMARY HEALTH CARE':                 'NPHCDA',
    'INSTITUTE OF PUBLIC ANALYSTS':                 'IPAN',
    'NIGERIA QUARANTINE SERVICES':                  'NAQS',
    'AGRICULTURAL AND RURAL MANAGEMENT':            'ARMTI',
    'FEDERAL COLLEGE OF AGRICULTURE':               'FCA',
    'NATIONAL ANIMAL PRODUCTION':                   'NAPRI',
    'NATIONAL INSTITUTE FOR FRESH WATER':           'NIFFR',
    'NATIONAL INSTITUTE OF OCEANOGRAPHY':           'NIOMR',
    'INSTITUTE FOR AGRICULTURAL RESEARCH':          'IAR',
    'NATIONAL DEFENCE COLLEGE':                     'NDC',
    'NIGERIAN DEFENCE ACADEMY':                     'NDA',
    'NIGERIAN AIR FORCE':                           'NAF',
    'MILITARY PENSIONS BOARD':                      'MPB',
    'FEDERAL GOVERNMENT SECRETARIAT':               'FGS',
    'TRADE FAIR COMPLEX':                           'TFC',
    'HOTEL AND CATERING SCHOOL':                    'HOTCAT',
    'FEDERAL MINISTRY OF INDUSTRY':                 'FMITI',
    'CONSUMER PROTECTION COUNCIL':                  'CPC',
    'GASHAKA-GUMI NATIONAL PARK':                   'GGNP',
    'GASHAKA':                                      'GGNP',
    'YANKARI NATIONAL PARK':                        'YNP',
    'ARABIC LANGUAGE VILLAGE':                      'ALV',
    'SKILL ACQUISITION':                            'SAT',
    'CENTER FOR BLACK AFRICAN':                     'CBAAC',
    'STATE OFFICE':                                 'STOFF',
    'HEADQUARTERS':                                 'HQ',
  };

  // Try known mappings (longest match first)
  const sortedKeys = Object.keys(known).sort((a,b) => b.length - a.length);
  for (const k of sortedKeys) {
    if (n.includes(k)) return known[k];
  }

  // Fallback: take first letters of each word (max 6 chars)
  const words = n.replace(/[^A-Z\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  if (words.length === 1) return words[0].slice(0, 6);
  return words.map(w => w[0]).join('').slice(0, 6) || 'FGN';
}

// ── TYPE CODE ─────────────────────────────────────────────────────────────────
function typeCode(type, purpose) {
  const t = (type || purpose || '').toLowerCase();
  if (t.includes('land') || t.includes('property')) return 'LND';
  if (t.includes('utility') || t.includes('util'))  return 'UTL';
  if (t.includes('environmental') || t.includes('env')) return 'ENV';
  if (t.includes('equipment') || t.includes('eqp')) return 'EQP';
  if (t.includes('monument'))                        return 'MON';
  return 'INF'; // Default: Infrastructure
}

// ── BRANCH CODE ───────────────────────────────────────────────────────────────
function branchCode(state) {
  if (!state) return '001';
  const s = state.toLowerCase().trim();
  return STATE_CODES[s] || '001';
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection(COL);

  // Get all scraped assets (FGN-FGN-BLD prefix = old bad format)
  const scraped = await col.find({
    assetId: { $regex: /^FGN-FGN-BLD-/ }
  }).toArray();

  console.log(`Found ${scraped.length} scraped assets to recode\n`);

  // Track sequence numbers per group: MDA_CODE-TYPE-BRANCH-YEAR
  const seqMap = {};
  let updated = 0, failed = 0;

  for (const doc of scraped) {
    const mda    = mdaCode(doc.mda || doc.name);
    const type   = typeCode(doc.type, doc.purpose);
    const branch = branchCode(doc.state);
    const year   = new Date(doc.createdAt || Date.now()).getFullYear();
    const groupKey = `${mda}-${type}-${branch}-${year}`;

    seqMap[groupKey] = (seqMap[groupKey] || 0) + 1;
    const seq = String(seqMap[groupKey]).padStart(4, '0');

    const newAssetId   = `FGN-${mda}-${type}-${branch}-${year}-${seq}`;
    const newAssetCode = newAssetId;

    try {
      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            assetId:   newAssetId,
            assetCode: newAssetCode,
            condition: doc.condition === 'Unknown' ? 'Good' : doc.condition,
            updatedAt: new Date(),
          }
        }
      );
      updated++;
      console.log(`  ✓ ${(doc.assetId || '').padEnd(32)} → ${newAssetId}  [${doc.mda?.slice(0,40) || ''}]`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${doc.assetId}: ${e.message}`);
    }
  }

  // Also fix any remaining condition === 'Unknown' on non-scraped assets if needed
  const condFixed = await col.updateMany(
    { condition: 'Unknown' },
    { $set: { condition: 'Good', updatedAt: new Date() } }
  );

  await client.close();

  console.log(`
┌──────────────────────────────────────────┐
│  Recode Complete                         │
├──────────────────────────────────────────┤
│  Assets recoded      : ${String(updated).padEnd(17)} │
│  Errors              : ${String(failed).padEnd(17)} │
│  Condition fixed     : ${String(condFixed.modifiedCount).padEnd(17)} │
└──────────────────────────────────────────┘
`);
}

run().catch(console.error);
