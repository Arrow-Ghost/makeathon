import { db } from './_lib/db.js';
import { EVENT } from './_lib/event.js';
import { HttpError, route } from './_lib/http.js';
import { requireSession } from './_lib/session.js';
import { profileOut, submissionOut } from './_lib/shape.js';

// GET /api/admin -> every participant, team, submission and notify-me subscriber.
// Read-only, and only for the addresses in ADMIN_EMAILS (see api/_lib/event.js).
export default route('admin', {
  async GET(req) {
    const session = await requireSession(req);
    if (!session.admin) throw new HttpError(403, 'This account does not have admin access');
    const sql = db();
    const [participants, teams, submissions, subscribers] = await Promise.all([
      sql`SELECT p.*, p.dob::text AS dob_text, m.team_id
          FROM participants p LEFT JOIN team_members m ON m.participant_id = p.id
          ORDER BY p.created_at DESC`,
      sql`SELECT t.*, (SELECT count(*) FROM team_members m WHERE m.team_id = t.id)::int AS member_count
          FROM teams t ORDER BY t.created_at DESC`,
      sql`SELECT * FROM submissions`,
      sql`SELECT email, created_at FROM subscribers ORDER BY created_at DESC`,
    ]);
    const byTeam = new Map(submissions.map((s) => [s.team_id, s]));
    return {
      event: EVENT,
      admin: session.email,
      generatedAt: new Date().toISOString(),
      participants: participants.map((p) => ({ ...profileOut(p), teamId: p.team_id })),
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        inviteCode: t.invite_code,
        leaderId: t.leader_id,
        memberCount: t.member_count,
        track: t.track,
        problemStatement: t.problem_statement,
        components: t.components ?? [],
        componentsUpdatedAt: t.components_updated_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        submission: submissionOut(byTeam.get(t.id)),
      })),
      subscribers: subscribers.map((s) => ({ email: s.email, createdAt: s.created_at })),
    };
  },
});
