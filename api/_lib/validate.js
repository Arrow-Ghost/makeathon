// Server-side validation for everything /register submits. Each function returns
// clean values ready for the database or throws a 400 naming the offending field.
import { EVENT } from './event.js';
import { HttpError } from './http.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const bad = (field, message) => new HttpError(400, message, { field });

function str(src, key, label, { min = 1, max = 120, required = true, multiline = false } = {}) {
  const raw = src[key] == null ? '' : String(src[key]).replace(CONTROL, '');
  const value = multiline ? raw.trim() : raw.trim().replace(/\s+/g, ' ');
  if (!value) {
    if (required) throw bad(key, `${label} is required`);
    return null;
  }
  if (value.length < min) throw bad(key, `${label} is too short`);
  if (value.length > max) throw bad(key, `${label} must be at most ${max} characters`);
  return value;
}

function oneOf(src, key, label, options, required = true) {
  const value = src[key];
  if (value == null || value === '') {
    if (required) throw bad(key, `Choose ${label}`);
    return null;
  }
  if (!options.includes(value)) throw bad(key, `Choose a valid ${label}`);
  return value;
}

function num(src, key, label, min, max, { required = true, integer = true } = {}) {
  const raw = src[key];
  if (raw == null || raw === '') {
    if (required) throw bad(key, `${label} is required`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    throw bad(key, `${label} must be between ${min} and ${max}`);
  }
  return integer ? value : Math.round(value * 100) / 100;
}

function email(src, key, label, required = true) {
  const value = str(src, key, label, { max: 254, required })?.toLowerCase() ?? null;
  if (value && !EMAIL.test(value)) throw bad(key, `Enter a valid ${label.toLowerCase()}`);
  return value;
}

function url(src, key, label) {
  const value = str(src, key, label, { max: 500, required: false });
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw bad(key, `${label} must be a full link starting with https://`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw bad(key, `${label} must be a full link starting with https://`);
  return parsed.href;
}

// Students take part as undergraduates or postgraduates; PhD scholars register as researchers.
function studentLevel(p) {
  if (!EVENT.studentLevels.includes(p.educationLevel)) {
    throw bad('educationLevel', 'Students must be undergraduate or postgraduate. PhD scholars register as Researcher.');
  }
  return p.educationLevel;
}

export function cleanProfile(input) {
  if (!input || typeof input !== 'object') throw bad('profile', 'Profile details are missing');
  const p = input;
  const type = oneOf(p, 'participantType', 'whether you are a student, professional or researcher', ['student', 'professional', 'researcher']);
  const affiliation = oneOf(p, 'affiliation', 'internal (VIT) or external', ['internal', 'external']);
  const internal = affiliation === 'internal';
  const studies = type === 'student' || type === 'researcher';

  const phone = str(p, 'phone', 'Phone number', { max: 20 });
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s()-]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
    throw bad('phone', 'Enter a valid phone number with 10 to 15 digits');
  }

  const dob = str(p, 'dob', 'Date of birth', { max: 10 });
  const born = new Date(`${dob}T00:00:00Z`);
  const age = (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== dob) {
    throw bad('dob', 'Enter a valid date of birth');
  }
  if (age < 14 || age > 90) throw bad('dob', 'Check your date of birth');

  const record = {
    full_name: str(p, 'fullName', 'Full name', { min: 2, max: 80 }),
    phone,
    gender: oneOf(p, 'gender', 'a gender option', EVENT.genders),
    dob,
    participant_type: type,
    affiliation,
    org_name: null,
    org_address: null,
    education_level: type === 'student' ? studentLevel(p) : oneOf(p, 'educationLevel', 'an education level', EVENT.educationLevels, false),
    degree: str(p, 'degree', 'Degree', { max: 80, required: studies }),
    branch: str(p, 'branch', type === 'researcher' ? 'Research area' : 'Branch', { max: 100, required: studies }),
    year_of_study: type === 'student' ? num(p, 'yearOfStudy', 'Year of study', 1, 6) : null,
    graduation_year: num(p, 'graduationYear', 'Graduation year', 1960, 2035, { required: type === 'student' }),
    cgpa: num(p, 'cgpa', 'CGPA', 0, 10, { required: type === 'student', integer: false }),
    vit_campus: null,
    vit_reg_no: null,
    vit_email: null,
    residence: null,
    hostel_block: null,
    hostel_room: null,
    special_requirements: str(p, 'specialRequirements', 'Special requirements', { max: 600, required: false, multiline: true }),
  };

  if (internal) {
    record.vit_campus = oneOf(p, 'vitCampus', 'your VIT campus', EVENT.campuses);
    record.vit_email = email(p, 'vitEmail', 'College email');
    record.org_name = `VIT ${record.vit_campus}`;
    if (studies) {
      const reg = str(p, 'vitRegNo', 'Registration number', { max: 15 }).replace(/\s/g, '').toUpperCase();
      if (!/^\d{2}[A-Z]{3}\d{4,5}$/.test(reg)) throw bad('vitRegNo', 'Enter a registration number like 22BEC1234');
      record.vit_reg_no = reg;
      record.residence = oneOf(p, 'residence', 'hosteler or day scholar', ['hosteler', 'day_scholar']);
      if (record.residence === 'hosteler') {
        record.hostel_block = str(p, 'hostelBlock', 'Hostel block', { max: 20 });
        record.hostel_room = str(p, 'hostelRoom', 'Room number', { max: 10 });
      }
    }
  } else {
    const orgLabel = type === 'professional' ? 'Company name' : 'College / institution name';
    const addrLabel = type === 'professional' ? 'Company address' : 'College address';
    record.org_name = str(p, 'orgName', orgLabel, { min: 2, max: 120 });
    record.org_address = str(p, 'orgAddress', addrLabel, { min: 5, max: 300, multiline: true });
  }
  return record;
}

export function cleanTeamName(body) {
  const name = str(body, 'name', 'Team name', { min: 3, max: 40 });
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .&'_-]*$/u.test(name)) {
    throw bad('name', 'Use letters, numbers, spaces and . & \' _ - only');
  }
  return name;
}

export function cleanInviteCode(body) {
  const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) throw bad('code', 'Enter the 6-character team code');
  return code;
}

export function cleanTrack(body) {
  const track = EVENT.tracks.find((t) => t.id === body.track);
  if (!track) throw bad('track', 'Choose a track');
  let statement = null;
  if (track.ownProblem) {
    statement = str(body, 'problemStatement', 'Your problem statement', { min: 10, max: 300, multiline: true });
  } else if (track.statements.length) {
    statement = oneOf(body, 'problemStatement', 'a problem statement', track.statements.map((s) => s.id));
  }
  return { track: track.id, problem_statement: statement };
}

export function cleanComponents(body) {
  if (!Array.isArray(body.items)) throw bad('items', 'Component list is missing');
  const items = body.items
    .filter((item) => item && typeof item === 'object' && String(item.name ?? '').trim())
    .map((item, i) => ({
      name: str(item, 'name', `Component ${i + 1}`, { max: 80 }),
      qty: num(item, 'qty', `Quantity for component ${i + 1}`, 1, 100),
      notes: str(item, 'notes', `Notes for component ${i + 1}`, { max: 160, required: false }),
    }));
  if (items.length > 40) throw bad('items', 'List at most 40 components');
  return items;
}

export function cleanSubmission(body) {
  return {
    title: str(body, 'title', 'Project title', { min: 3, max: 120 }),
    abstract: str(body, 'abstract', 'Solution summary', { min: 30, max: 3000, multiline: true }),
    repo_url: url(body, 'repoUrl', 'Repository link'),
    demo_url: url(body, 'demoUrl', 'Demo video link'),
    document_url: url(body, 'documentUrl', 'Document link'),
  };
}
