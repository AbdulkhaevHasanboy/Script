const fs = require('fs');
const path = require('path');

const MAILS_DIR = path.join(__dirname);
const DB_PATH = path.join(__dirname, '..', 'Names_db.json');
const NEW_CSV_PATH = path.join(__dirname, '..', 'NEW.csv');
const EXTRACTED_JSON_PATH = path.join(__dirname, '..', 'extracted_activations.json');
const OUTPUT_JS_PATH = path.join(__dirname, 'activations.js');
const OUTPUT_JSON_PATH = path.join(__dirname, 'activations.json');

// Load database to map emails -> full names & document IDs
let emailToStudentMap = {};

if (fs.existsSync(DB_PATH)) {
  try {
    const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    for (const item of dbData) {
      if (item.email) {
        const cleanEmail = item.email.trim().toLowerCase();
        emailToStudentMap[cleanEmail] = {
          fullName: item.name || item.full_name || '',
          document: item.document || '',
          dob: item.dob || ''
        };
      }
    }
  } catch (err) {
    console.error('Warning loading Names_db.json:', err.message);
  }
}

// Fallback lookup from NEW.csv if needed
if (fs.existsSync(NEW_CSV_PATH)) {
  try:
    const csvContent = fs.readFileSync(NEW_CSV_PATH, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const idIdx = headers.indexOf('student_id');
    const nameIdx = headers.indexOf('full_name');
    const emailIdx = headers.indexOf('email');

    if (emailIdx !== -1) {
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',');
        const emailVal = (cols[emailIdx] || '').trim().toLowerCase();
        if (emailVal && !emailToStudentMap[emailVal]) {
          emailToStudentMap[emailVal] = {
            fullName: (cols[nameIdx] || '').trim(),
            document: (cols[idIdx] || '').trim()
          };
        }
      }
    }
  } catch (err) {
    console.error('Warning loading NEW.csv:', err.message);
  }
}

// Helper to extract email recipient and activation link from .eml content
function parseEmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract To header email
  const toMatch = content.match(/To:\s*.*?([\w\.-]+@[\w\.-]+)/i);
  let recipientEmail = toMatch ? toMatch[1].trim().toLowerCase() : null;

  // Extract activation URL and token
  const urlMatch = content.match(/https:\/\/aileaders\.uz\/auth\/activate\/[^\s"'>\<#]+/i);
  let activationUrl = null;
  let token = null;

  if (urlMatch) {
    activationUrl = urlMatch[0].replace(/&amp;/g, '&');
    const tokenMatch = activationUrl.match(/[?&]token=([a-f0-9]+)/i);
    if (tokenMatch) {
      token = tokenMatch[1];
    }
  }

  return { recipientEmail, activationUrl, token };
}

function main() {
  console.log('🔍 Processing downloaded mails in', MAILS_DIR, '...');
  
  const files = fs.readdirSync(MAILS_DIR).filter(f => f.endsWith('.eml'));
  console.log(`Found ${files.length} .eml files.`);

  let results = [];
  let processedEmails = new Set();

  for (const file of files) {
    const filePath = path.join(MAILS_DIR, file);
    try {
      const { recipientEmail, activationUrl, token } = parseEmlFile(filePath);
      
      if (recipientEmail && activationUrl) {
        if (processedEmails.has(recipientEmail)) continue;
        processedEmails.add(recipientEmail);

        const studentInfo = emailToStudentMap[recipientEmail] || {};
        
        results.push({
          fullName: studentInfo.fullName || 'Unknown',
          document: studentInfo.document || '',
          email: recipientEmail,
          activationKey: token || '',
          activationUrl: activationUrl,
          emlFile: file
        });
      }
    } catch (err) {
      console.error(`Error parsing ${file}:`, err.message);
    }
  }

  // Also include extracted_activations.json if available
  if (fs.existsSync(EXTRACTED_JSON_PATH)) {
    try {
      const extractedData = JSON.parse(fs.readFileSync(EXTRACTED_JSON_PATH, 'utf-8'));
      for (const [eAddr, info] of Object.entries(extractedData)) {
        const cleanEmail = eAddr.trim().toLowerCase();
        if (!processedEmails.has(cleanEmail)) {
          processedEmails.add(cleanEmail);
          const studentInfo = emailToStudentMap[cleanEmail] || {};
          results.push({
            fullName: studentInfo.fullName || 'Unknown',
            document: studentInfo.document || '',
            email: cleanEmail,
            activationKey: info.token || '',
            activationUrl: info.activation_url || '',
            emlFile: info.eml_file || ''
          });
        }
      }
    } catch (err) {
      console.error('Warning reading extracted_activations.json:', err.message);
    }
  }

  console.log(`✅ Extracted activation details for ${results.length} students.`);

  // 1. Write JS module file: mails/activations.js
  const jsContent = `// AI Leaders Student Activation Keys & Emails\n// Total Records: ${results.length}\n// Generated at: ${new Date().toISOString()}\n\nmodule.exports = ${JSON.stringify(results, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_JS_PATH, jsContent, 'utf-8');
  console.log(`💾 Saved JS module to: ${OUTPUT_JS_PATH}`);

  // 2. Write JSON file: mails/activations.json
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`💾 Saved JSON dataset to: ${OUTPUT_JSON_PATH}`);
}

main();
