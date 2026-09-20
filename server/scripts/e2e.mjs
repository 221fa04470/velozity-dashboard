/**
 * End-to-end API + WebSocket checks (auth, RBAC, scoping, live feed, notifications, scheduler).
 *
 *   1. start Postgres, run migrations and the seed on a fresh database
 *   2. start the API with a fast scheduler:  OVERDUE_CRON='*/3 * * * * *' npm run dev
 *   3. npm run test:e2e
 *
 * It relies on the seed data (project ids, 3 overdue tasks) and mutates data, so re-seed before re-running.
 */
import { io } from 'socket.io-client';
const API = 'http://localhost:4000/api';
const H = { 'content-type': 'application/json', 'x-requested-with': 'velozity-client' };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); if (c) console.log('ok  ', m); };
const req = async (path, { token, method = 'GET', body, cookie } = {}) => {
  const r = await fetch(API + path, { method, headers: { ...H, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json, headers: r.headers };
};
const login = async (email) => {
  const r = await req('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } });
  const setCookie = r.headers.getSetCookie()[0];
  return { token: r.json.accessToken, user: r.json.user, cookie: setCookie.split(';')[0], setCookie };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = (token) => new Promise((resolve, reject) => {
  const s = io('http://localhost:4000', { transports: ['websocket'], auth: { token } });
  s.events = [];
  s.onAny((e, p) => s.events.push([e, p]));
  s.on('connect', () => resolve(s)); s.on('connect_error', reject);
});

const admin = await login('admin@velozity.dev');
const priya = await login('priya@velozity.dev');
const rohan = await login('rohan@velozity.dev');
const ravi = await login('ravi@velozity.dev');
const karthik = await login('karthik@velozity.dev');

// --- auth ---
ok(/HttpOnly/i.test(admin.setCookie) && /Path=\/api\/auth/.test(admin.setCookie), 'refresh cookie is HttpOnly + scoped');
ok(!('refreshToken' in (await req('/auth/me', { token: admin.token })).json), 'refresh token never in body');
let r = await req('/auth/login', { method: 'POST', body: { email: 'admin@velozity.dev', password: 'nope' } });
ok(r.status === 401 && r.json.error.code === 'INVALID_CREDENTIALS', 'bad password -> 401 structured');
r = await req('/auth/login', { method: 'POST', body: { email: 'x' } });
ok(r.status === 400 && r.json.error.code === 'VALIDATION_ERROR' && Array.isArray(r.json.error.details), 'validation error shape');
r = await req('/auth/refresh', { method: 'POST', cookie: karthik.cookie });
ok(r.status === 200 && r.json.accessToken, 'refresh rotates');
const newCookie = r.headers.getSetCookie()[0].split(';')[0];
r = await req('/auth/refresh', { method: 'POST', cookie: karthik.cookie });
ok(r.status === 401 && r.json.error.code === 'REFRESH_REUSED', 'reused refresh token rejected');
r = await req('/auth/refresh', { method: 'POST', cookie: newCookie });
ok(r.status === 401, 'reuse detection revoked the whole family');
const karthik2 = await login('karthik@velozity.dev');

// --- forged token / role checks ---
const [h, p, s] = ravi.token.split('.');
const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'ADMIN' })).toString('base64url');
r = await req('/users', { token: `${h}.${forgedPayload}.${s}` });
ok(r.status === 401, 'modified token (role=ADMIN) rejected');
r = await req('/users', { token: ravi.token });
ok(r.status === 403, 'developer -> /users 403');
r = await req('/clients', { token: ravi.token });
ok(r.status === 403, 'developer -> /clients 403');
r = await req('/tasks', { method: 'POST', token: ravi.token, body: { projectId: 1, title: 'x' } });
ok(r.status === 403, 'developer cannot create tasks');
r = await req('/users', { token: priya.token });
ok(r.status === 200 && r.json.data.every((u) => u.role === 'DEVELOPER'), 'PM sees developers only');
r = await req('/users', { method: 'POST', token: priya.token, body: {} });
ok(r.status === 403, 'PM cannot create users');
r = await req('/tasks');
ok(r.status === 401, 'no token -> 401');

// --- scoping ---
r = await req('/tasks?pageSize=100', { token: ravi.token });
ok(r.json.data.length > 0 && r.json.data.every((t) => t.assignee?.id === ravi.user.id), 'developer lists only own tasks');
const sorted = r.json.data.every((t, i, a) => i === 0 || ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(a[i - 1].priority) >= ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(t.priority));
ok(sorted, 'default sort = priority desc');
const all = (await req('/tasks?pageSize=100', { token: admin.token })).json;
const otherTask = all.data.find((t) => t.assignee?.id !== ravi.user.id);
r = await req(`/tasks/${otherTask.id}`, { token: ravi.token });
ok(r.status === 404, "developer can't read another dev's task by id");
r = await req(`/tasks/${otherTask.id}/status`, { method: 'PATCH', token: ravi.token, body: { status: 'DONE' } });
ok(r.status === 404, "developer can't change another dev's task");
r = await req('/projects/1', { token: rohan.token });
ok(r.status === 404, "PM can't read another PM's project");
r = await req('/projects/1', { method: 'PATCH', token: rohan.token, body: { name: 'hack' } });
ok(r.status === 404, "PM can't edit another PM's project");
r = await req('/tasks', { method: 'POST', token: rohan.token, body: { projectId: 1, title: 'sneaky' } });
ok(r.status === 404, "PM can't add tasks to another PM's project");
r = await req('/tasks?pageSize=100', { token: rohan.token });
ok(r.json.data.every((t) => [3, 4].includes(t.project.id)), 'PM tasks limited to own projects');
r = await req('/projects', { token: admin.token });
ok(r.json.data.length === 4, 'admin sees all projects');
r = await req('/projects', { token: rohan.token });
ok(r.json.data.length === 2, 'PM sees own projects');

// --- filters ---
r = await req('/tasks?status=TODO,IN_PROGRESS&priority=HIGH,CRITICAL&pageSize=100', { token: admin.token });
ok(r.json.data.length > 0 && r.json.data.every((t) => ['TODO', 'IN_PROGRESS'].includes(t.status) && ['HIGH', 'CRITICAL'].includes(t.priority)), 'status+priority filters');
const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10), to = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
r = await req(`/tasks?dueFrom=${from}&dueTo=${to}&pageSize=100`, { token: admin.token });
ok(r.json.data.length > 0 && r.json.data.every((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to + 'T23:59:59.999Z'), 'due range filter');
r = await req('/tasks?status=NOPE', { token: admin.token });
ok(r.status === 400, 'invalid filter -> 400');
r = await req('/tasks?overdue=true', { token: admin.token });
ok(r.json.data.length === 3, '3 overdue tasks seeded');

// --- dashboards ---
r = await req('/dashboard', { token: admin.token });
ok(r.json.role === 'ADMIN' && r.json.totalProjects === 4 && r.json.overdueTasks === 3, 'admin dashboard');
r = await req('/dashboard', { token: priya.token });
ok(r.json.role === 'PROJECT_MANAGER' && r.json.openTasksByPriority && Array.isArray(r.json.dueThisWeek), 'PM dashboard');
r = await req('/dashboard', { token: ravi.token });
ok(r.json.role === 'DEVELOPER' && r.json.assignedTasks.length > 0, 'dev dashboard');

// --- activity scoping + missed ---
const feedAdmin = (await req('/activity?limit=20', { token: admin.token })).json;
ok(feedAdmin.data.length === 20 && feedAdmin.nextCursor, 'admin feed: 20 + cursor');
const page2 = (await req(`/activity?limit=20&before=${feedAdmin.nextCursor}`, { token: admin.token })).json;
ok(page2.data.length > 0 && page2.data[0].id < feedAdmin.nextCursor + 1 && !page2.data.some((e) => feedAdmin.data.find((x) => x.id === e.id)), 'cursor pagination no overlap');
const feedRavi = (await req('/activity?limit=100', { token: ravi.token })).json;
const raviTaskIds = new Set((await req('/tasks?pageSize=100', { token: ravi.token })).json.data.map((t) => t.id));
ok(feedRavi.data.length > 0 && feedRavi.data.every((e) => raviTaskIds.has(e.task.id)), 'developer feed only own tasks');
const feedRohan = (await req('/activity?limit=100', { token: rohan.token })).json;
ok(feedRohan.data.length > 0 && feedRohan.data.every((e) => [3, 4].includes(e.project.id)), 'PM feed only own projects');
const missed = (await req('/activity/missed', { token: priya.token })).json;
ok(missed.total > 0 && missed.events.length <= 20 && missed.since, `missed events from DB (total ${missed.total})`);

// --- realtime ---
const sAdmin = await connect(admin.token);
const sPriya = await connect(priya.token);
const sRohan = await connect(rohan.token);
const sRavi = await connect(ravi.token);
const sKarthik = await connect(karthik2.token);
await sleep(300);
ok(sAdmin.events.some(([e, p]) => e === 'presence:count' && p.online >= 5), 'admin gets live presence count');
try { await connect('garbage'); ok(false, 'bad token socket rejected'); } catch { ok(true, 'bad token socket rejected'); }

const raviTask = (await req('/tasks?status=TODO,IN_PROGRESS&pageSize=100', { token: ravi.token })).json.data.find((t) => t.project.id === 1 || t.project.id === 2);
r = await req(`/tasks/${raviTask.id}/status`, { method: 'PATCH', token: ravi.token, body: { status: 'IN_REVIEW' } });
ok(r.status === 200 && r.json.status === 'IN_REVIEW', 'developer moves own task to In Review');
await sleep(400);
const got = (s, e) => s.events.filter(([n]) => n === e).map(([, p]) => p);
ok(got(sAdmin, 'activity:new').some((a) => a.task.id === raviTask.id && a.toStatus === 'IN_REVIEW' && a.actor.name === 'Ravi Kumar'), 'admin receives activity live');
ok(got(sPriya, 'activity:new').some((a) => a.task.id === raviTask.id), 'owning PM receives activity live');
ok(got(sRavi, 'activity:new').some((a) => a.task.id === raviTask.id), 'assignee receives activity live');
ok(!got(sRohan, 'activity:new').some((a) => a.task.id === raviTask.id), 'other PM does NOT receive it');
ok(!got(sKarthik, 'activity:new').length && !got(sKarthik, 'task:changed').length, 'other developer does NOT receive it');
const note = got(sPriya, 'notification:new')[0];
ok(note && note.notification.type === 'TASK_IN_REVIEW' && note.unreadCount >= 1, 'PM gets In Review notification + live count');
const before = (await req('/notifications', { token: priya.token })).json.unreadCount;
r = await req(`/notifications/${note.notification.id}/read`, { method: 'POST', token: priya.token });
ok(r.json.unreadCount === before - 1 && got(sPriya, 'notification:count').at(-1)?.unreadCount === before - 1, 'mark one read (+live count)');
r = await req(`/notifications/${note.notification.id}/read`, { method: 'POST', token: rohan.token });
ok(r.status === 404, "can't mark someone else's notification");
r = await req('/notifications/read-all', { method: 'POST', token: priya.token });
ok(r.json.unreadCount === 0 && got(sPriya, 'notification:count').at(-1)?.unreadCount === 0, 'mark all read (+live count)');

// assignment notification + reassign removal
const t = await req('/tasks', { method: 'POST', token: priya.token, body: { projectId: 1, title: 'E2E task', assigneeId: karthik.user.id, priority: 'HIGH', dueDate: '2000-01-01' } });
ok(t.status === 201, 'PM creates task');
await sleep(400);
ok(got(sKarthik, 'notification:new').some((n) => n.notification.type === 'TASK_ASSIGNED'), 'developer gets assignment notification live');
ok(got(sKarthik, 'activity:new').some((a) => a.type === 'TASK_CREATED'), 'assignee sees created event');
r = await req(`/tasks/${t.json.id}`, { method: 'PATCH', token: priya.token, body: { assigneeId: ravi.user.id } });
await sleep(400);
ok(got(sKarthik, 'task:changed').some((e) => e.action === 'removed' && e.taskId === t.json.id), 'previous assignee told to drop the task');
ok(got(sRavi, 'notification:new').some((n) => n.notification.message.includes('E2E task')), 'new assignee notified');

// overdue scheduler (runs every 3s in this test)
await sleep(4500);
r = await req(`/tasks/${t.json.id}`, { token: priya.token });
ok(r.json.isOverdue === true && r.json.activity.some((a) => a.type === 'TASK_OVERDUE'), 'scheduler flagged overdue + logged it');
ok(got(sAdmin, 'task:changed').some((e) => e.task?.id === t.json.id && e.task.isOverdue), 'overdue pushed live');

// presence + lastSeenAt
sKarthik.disconnect(); await sleep(400);
ok(got(sAdmin, 'presence:count').at(-1).online === 4, 'presence drops on disconnect');
const missedK = (await req('/activity/missed', { token: karthik2.token })).json;
ok(missedK.since && new Date(missedK.since) > new Date(Date.now() - 60000), 'lastSeenAt stored on disconnect');

// misc
r = await req('/nope', { token: admin.token });
ok(r.status === 404 && r.json.error.code === 'NOT_FOUND', '404 structured');
const bad = await fetch(API + '/tasks', { method: 'POST', headers: { ...H, authorization: `Bearer ${admin.token}` }, body: '{bad' });
ok(bad.status === 400 && (await bad.json()).error.code === 'BAD_REQUEST', 'malformed JSON -> structured 400');
r = await req('/auth/logout', { method: 'POST', cookie: ravi.cookie });
ok(r.status === 204, 'logout');
[sAdmin, sPriya, sRohan, sRavi].forEach((s) => s.disconnect());
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
