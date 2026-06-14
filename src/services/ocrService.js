'use strict';
const tesseract = require('node-tesseract-ocr');
const pdfParse  = require('pdf-parse');
const mammoth   = require('mammoth');
const env       = require('../config/env');
const os        = require('os');
const path      = require('path');
const fs        = require('fs/promises');

const TESSERACT_CONFIG = {
  lang:    env.TESSERACT_LANG,
  oem:     1,
  psm:     3,
};

/**
 * OCR an image buffer. Returns raw text string.
 */
async function ocrImage(buffer, mimeType) {
  // Write to temp file (node-tesseract-ocr requires a file path)
  const ext  = mimeType === 'image/png' ? '.png' : '.jpg';
  const tmp  = path.join(os.tmpdir(), `ocr_${Date.now()}${ext}`);
  await fs.writeFile(tmp, buffer);
  try {
    const text = await tesseract.recognize(tmp, TESSERACT_CONFIG);
    return text.trim();
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/**
 * Extract text from PDF buffer.
 */
async function extractPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text.trim();
}

/**
 * Extract text from DOCX buffer.
 */
async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * Route text extraction by mime type.
 */
async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') return extractPDF(buffer);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   || mimeType === 'application/msword') return extractDOCX(buffer);
  if (mimeType === 'text/plain') return buffer.toString('utf-8').trim();
  return ocrImage(buffer, mimeType);
}

/**
 * Parse free text and suggest field values (heuristic — extendable with NLP).
 */
function suggestFields(text) {
  const suggestions = {};

  // State detection (Nigerian states)
  const nigerianStates = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
    'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
    'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
    'Zamfara','FCT','Abuja',
  ];
  for (const state of nigerianStates) {
    if (new RegExp(`\\b${state}\\b`, 'i').test(text)) {
      suggestions.state = state;
      break;
    }
  }

  // Asset name — first line or after "Asset:" label
  const nameMatch = text.match(/(?:asset|property|structure)[:\s]+([^\n]{3,60})/i)
    || text.match(/^([^\n]{5,60})/);
  if (nameMatch) suggestions.name = nameMatch[1].trim();

  // Condition keywords
  if (/\b(good|excellent|sound)\b/i.test(text))     suggestions.condition = 'Good';
  else if (/\b(fair|moderate|average)\b/i.test(text)) suggestions.condition = 'Fair';
  else if (/\b(poor|damaged|dilapidated)\b/i.test(text)) suggestions.condition = 'Poor';
  else if (/\b(critical|collapsed|failed|emergency)\b/i.test(text)) suggestions.condition = 'Critical';

  // Coordinates — "Lat: 9.07, Long: 7.39" etc.
  const coordMatch = text.match(/lat(?:itude)?[:\s]+([\d.]+)[,\s]+lon(?:g|gitude)?[:\s]+([\d.]+)/i);
  if (coordMatch) suggestions.coordinates = [parseFloat(coordMatch[2]), parseFloat(coordMatch[1])];

  return suggestions;
}

module.exports = { ocrImage, extractText, suggestFields };
