import { randomInt } from 'node:crypto';
import { db } from './_lib/db.js';
import { EVENT } from './_lib/event.js';
import { HttpError, readJson, route } from './_lib/http.js';
import { requireSession } from './_lib/session.js';
import { profileOut, submissionOut } from './_lib/shape.js';
import {
  cleanComponents, cleanInviteCode, cleanProfile, cleanSubmission, cleanTeamName, cleanTrack,
} from './_lib/validate.js';

// No 0/O, 1/I/L: the code is read aloud and typed by hand.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newInviteCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

const violated = (error, constraint) =>
  error?.code === '23505' && (error.constraint === constraint || String(error.message).includes(constraint));

// Team changes run as SERIALIZABLE transactions, so two people joining a 4/5 team at
// the same moment cannot both get in; Postgres aborts one, and it is retried.
async function serializable(build) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().transaction(build, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error?.code !== '40001' || attempt >= 2) throw error;
    }
  }
}

async function findParticipant(email) {
  const [p] = await db()`SELECT *, dob::text AS dob_text FROM participants WHERE email = ${email}`;
  return p ?? null;
}

// Everything /register shows for the signed-in person.
async function loadState(email) {
  const sql = db();
  const base = { event: EVENT, email, profile: null, team: null };
  const p = await findParticipant(email);
  if (!p) return base;
  base.profile = profileOut(p);

  const [t] = await sql`
    SELECT t.* FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.participant_id = ${p.id}`;
  if (!t) return base;
  const [members, [submission]] = await Promise.all([
    sql`SELECT p.id, p.full_name, p.email, p.participant_type, p.affiliation, p.org_name, m.joined_at
        FROM team_members m JOIN participants p ON p.id = m.participant_id
        WHERE m.team_id = ${t.id} ORDER BY m.joined_at`,
    sql`SELECT * FROM submissions WHERE team_id = ${t.id}`,
  ]);
  base.team = {
    id: t.id,
    name: t.name,
    inviteCode: t.invite_code,
    leaderId: t.leader_id,
    isLeader: t.leader_id === p.id,
    track: t.track,
    problemStatement: t.problem_statement,
    components: t.components ?? [],
    componentsUpdatedAt: t.components_updated_at,
    createdAt: t.created_at,
    members: members.map((m) => ({
      id: m.id,
      fullName: m.full_name,
      email: m.email,
      participantType: m.participant_type,
      affiliation: m.affiliation,
      orgName: m.org_name,
      isLeader: m.id === t.leader_id,
      joinedAt: m.joined_at,
    })),
    submission: submissionOut(submission),
  };
  return base;
}

// The signed-in participant and their team, for the actions below.
async function context(email) {
  const p = await findParticipant(email);
  if (!p) throw new HttpError(409, 'Save your profile first');
  const [m] = await db()`
    SELECT t.id, t.leader_id FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.participant_id = ${p.id}`;
  return { p, teamId: m?.id ?? null, isLeader: Boolean(m) && m.leader_id === p.id };
}

function needTeam(ctx) {
  if (!ctx.teamId) throw new HttpError(409, 'Create or join a team first');
}

function needLeader(ctx) {
  needTeam(ctx);
  if (!ctx.isLeader) throw new HttpError(403, 'Only your team leader can change this');
}

function needOpen(flag, what) {
  if (!EVENT[flag]) throw new HttpError(403, `${what} is closed`);
}

const memberId = (body) => {
  const id = Number(body.participantId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Choose a team member');
  return id;
};

const actions = {
  async profile(email, body) {
    needOpen('registrationOpen', 'Registration');
    const r = cleanProfile(body.profile);
    await db()`
      INSERT INTO participants (
        email, full_name, phone, gender, dob, participant_type, affiliation, org_name, org_address,
        education_level, degree, branch, year_of_study, graduation_year, cgpa,
        vit_campus, vit_reg_no, vit_email, residence, hostel_block, hostel_room, special_requirements)
      VALUES (
        ${email}, ${r.full_name}, ${r.phone}, ${r.gender}, ${r.dob}, ${r.participant_type}, ${r.affiliation},
        ${r.org_name}, ${r.org_address}, ${r.education_level}, ${r.degree}, ${r.branch}, ${r.year_of_study},
        ${r.graduation_year}, ${r.cgpa}, ${r.vit_campus}, ${r.vit_reg_no}, ${r.vit_email}, ${r.residence},
        ${r.hostel_block}, ${r.hostel_room}, ${r.special_requirements})
      ON CONFLICT (email) DO UPDATE SET
        full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, gender = EXCLUDED.gender, dob = EXCLUDED.dob,
        participant_type = EXCLUDED.participant_type, affiliation = EXCLUDED.affiliation,
        org_name = EXCLUDED.org_name, org_address = EXCLUDED.org_address,
        education_level = EXCLUDED.education_level, degree = EXCLUDED.degree, branch = EXCLUDED.branch,
        year_of_study = EXCLUDED.year_of_study, graduation_year = EXCLUDED.graduation_year, cgpa = EXCLUDED.cgpa,
        vit_campus = EXCLUDED.vit_campus, vit_reg_no = EXCLUDED.vit_reg_no, vit_email = EXCLUDED.vit_email,
        residence = EXCLUDED.residence, hostel_block = EXCLUDED.hostel_block, hostel_room = EXCLUDED.hostel_room,
        special_requirements = EXCLUDED.special_requirements, updated_at = now()`;
  },

  async createTeam(email, body) {
    needOpen('registrationOpen', 'Registration');
    const ctx = await context(email);
    if (ctx.teamId) throw new HttpError(409, 'You are already in a team. Leave it first to start another.');
    const name = cleanTeamName(body);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db()`
          WITH t AS (
            INSERT INTO teams (name, invite_code, leader_id) VALUES (${name}, ${newInviteCode()}, ${ctx.p.id})
            RETURNING id)
          INSERT INTO team_members (team_id, participant_id) SELECT id, ${ctx.p.id} FROM t`;
        return;
      } catch (error) {
        if (violated(error, 'teams_invite_code_key')) continue;
        if (violated(error, 'teams_name_lower_key')) {
          throw new HttpError(409, 'That team name is taken. Try another.', { field: 'name' });
        }
        if (error?.code === '23505') throw new HttpError(409, 'You are already in a team');
        throw error;
      }
    }
    throw new HttpError(503, 'Could not create the team. Please try again.');
  },

  async joinTeam(email, body) {
    needOpen('registrationOpen', 'Registration');
    const ctx = await context(email);
    if (ctx.teamId) throw new HttpError(409, 'You are already in a team. Leave it first to join another.');
    const code = cleanInviteCode(body);
    let joined;
    try {
      [joined] = await serializable((sql) => [sql`
        INSERT INTO team_members (team_id, participant_id)
        SELECT t.id, ${ctx.p.id} FROM teams t
        WHERE t.invite_code = ${code}
          AND (SELECT count(*) FROM team_members m WHERE m.team_id = t.id) < ${EVENT.teamMax}
        RETURNING team_id`]);
    } catch (error) {
      if (error?.code === '23505') throw new HttpError(409, 'You are already in a team');
      throw error;
    }
    if (joined.length) return;
    const [team] = await db()`SELECT id FROM teams WHERE invite_code = ${code}`;
    if (!team) throw new HttpError(404, 'No team has that code. Check it with your team leader.', { field: 'code' });
    throw new HttpError(409, `That team is full (${EVENT.teamMax} of ${EVENT.teamMax})`, { field: 'code' });
  },

  async leaveTeam(email) {
    const ctx = await context(email);
    needTeam(ctx);
    const [left] = await serializable((sql) => [ctx.isLeader
      // a leader can leave only as the last member, which deletes the team
      ? sql`DELETE FROM teams WHERE id = ${ctx.teamId} AND leader_id = ${ctx.p.id}
              AND (SELECT count(*) FROM team_members WHERE team_id = ${ctx.teamId}) = 1
            RETURNING id`
      : sql`DELETE FROM team_members m WHERE m.participant_id = ${ctx.p.id}
              AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id AND t.leader_id = ${ctx.p.id})
            RETURNING team_id`]);
    if (!left.length) throw new HttpError(409, 'Make another member the leader before you leave');
  },

  async removeMember(email, body) {
    const ctx = await context(email);
    needLeader(ctx);
    const target = memberId(body);
    if (target === ctx.p.id) throw new HttpError(400, 'Use “Leave team” to leave');
    const [removed] = await serializable((sql) => [sql`
      DELETE FROM team_members m USING teams t
      WHERE m.team_id = t.id AND t.id = ${ctx.teamId} AND t.leader_id = ${ctx.p.id}
        AND m.participant_id = ${target} AND m.participant_id <> t.leader_id
      RETURNING m.participant_id`]);
    if (!removed.length) throw new HttpError(404, 'That person is not in your team');
  },

  async makeLeader(email, body) {
    const ctx = await context(email);
    needLeader(ctx);
    const target = memberId(body);
    const [moved] = await serializable((sql) => [sql`
      UPDATE teams SET leader_id = ${target}, updated_at = now()
      WHERE id = ${ctx.teamId} AND leader_id = ${ctx.p.id}
        AND EXISTS (SELECT 1 FROM team_members WHERE team_id = ${ctx.teamId} AND participant_id = ${target})
      RETURNING id`]);
    if (!moved.length) throw new HttpError(404, 'That person is not in your team');
  },

  async track(email, body) {
    needOpen('registrationOpen', 'Track selection');
    const ctx = await context(email);
    needLeader(ctx);
    const { track, problem_statement } = cleanTrack(body);
    await db()`
      UPDATE teams SET track = ${track}, problem_statement = ${problem_statement}, updated_at = now()
      WHERE id = ${ctx.teamId} AND leader_id = ${ctx.p.id}`;
  },

  async components(email, body) {
    needOpen('componentsOpen', 'The components form');
    const ctx = await context(email);
    needLeader(ctx);
    const items = cleanComponents(body);
    await db()`
      UPDATE teams SET components = ${JSON.stringify(items)}::jsonb, components_updated_at = now(), updated_at = now()
      WHERE id = ${ctx.teamId} AND leader_id = ${ctx.p.id}`;
  },

  async submission(email, body) {
    needOpen('submissionsOpen', 'Submission');
    const ctx = await context(email);
    needLeader(ctx);
    const s = cleanSubmission(body);
    await db()`
      INSERT INTO submissions (team_id, title, abstract, repo_url, demo_url, document_url, submitted_by)
      VALUES (${ctx.teamId}, ${s.title}, ${s.abstract}, ${s.repo_url}, ${s.demo_url}, ${s.document_url}, ${ctx.p.id})
      ON CONFLICT (team_id) DO UPDATE SET
        title = EXCLUDED.title, abstract = EXCLUDED.abstract, repo_url = EXCLUDED.repo_url,
        demo_url = EXCLUDED.demo_url, document_url = EXCLUDED.document_url,
        submitted_by = EXCLUDED.submitted_by, updated_at = now()`;
  },
};

// GET  /api/register                  -> the signed-in person's registration
// POST /api/register { action, ... }  -> runs one action, then returns the updated registration
export default route('register', {
  async GET(req) {
    const { email } = await requireSession(req);
    return loadState(email);
  },

  async POST(req) {
    const { email } = await requireSession(req);
    const body = await readJson(req, 24 * 1024);
    const action = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
    if (!action) throw new HttpError(400, 'Unknown action');
    await action(email, body);
    return loadState(email);
  },
});
