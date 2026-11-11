// Event settings shared by the registration API and served to /register and /admin.
// Files in api/ that start with "_" are not deployed as Vercel functions.

// Who can open /admin. ADMIN_EMAILS (comma-separated) replaces this list when set.
const DEFAULT_ADMINS = ['sarthaktrivedi386@gmail.com'];

export function adminEmails() {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ADMINS;
}

export const isAdmin = (email) => adminEmails().includes(String(email).toLowerCase());

export const EVENT = {
  name: 'Makeathon 2027',
  teamMin: 3,
  teamMax: 5,
  // When problem statements are released, add them to a track as
  // { id: 'FW-01', title: 'Short title' }. Teams can only pick ids listed here.
  tracks: [
    { id: 'faultwatch', name: 'FaultWatch', statements: [] },
    { id: 'vitalis', name: 'Vitalis', statements: [] },
    { id: 'cosmolith', name: 'Cosmolith', statements: [] },
    { id: 'live-wire', name: 'Live Wire', statements: [] },
    { id: 'cogniforge', name: 'CogniForge', statements: [] },
    { id: 'open-innovation', name: 'Open Innovation', statements: [], ownProblem: true },
  ],
  campuses: ['Vellore', 'Chennai', 'AP (Amaravati)', 'Bhopal'],
  genders: ['Female', 'Male', 'Non-binary', 'Prefer not to say'],
  educationLevels: ['Diploma', 'Undergraduate', 'Postgraduate', 'PhD', 'Other'],
  // Eligibility: students must be undergraduate or postgraduate; PhD scholars register as researchers.
  studentLevels: ['Undergraduate', 'Postgraduate'],
  // Set to false to freeze edits once the window closes.
  registrationOpen: true,
  componentsOpen: true,
  submissionsOpen: true,
};
