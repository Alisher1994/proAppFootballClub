/**
 * Local Hikvision bridge for the football school.
 *
 * Runs near the terminals, pulls allowed students from the cloud, and writes
 * them into one or more Hikvision Face ID terminals.
 */

import http from 'node:http';
import https from 'node:https';

const CONFIG = {
  serverUrl: process.env.SERVER_URL || 'https://proapp.up.railway.app',
  deviceKey: process.env.DEVICE_INGEST_KEY || '',
  username: process.env.HIK_USER || 'admin',
  password: process.env.HIK_PASS || '',
  dailySyncTime: process.env.HIK_DAILY_SYNC_TIME || '03:00',
  scheduleCheckIntervalMs: Number(process.env.HIK_SCHEDULE_CHECK_INTERVAL_MS || 30000),
  commandPollIntervalMs: Number(process.env.COMMAND_POLL_INTERVAL_MS || 2000),
  defaultDoorRight: process.env.HIK_DOOR_RIGHT || '1',
  defaultPlanTemplateNo: process.env.HIK_PLAN_TEMPLATE_NO || '1',
  recreateUsersOnSync: (process.env.HIK_SYNC_RECREATE_USERS || 'false') === 'true',
  devices: JSON.parse(process.env.HIK_DEVICES_JSON || '[]'),
};

if (!CONFIG.devices.length && process.env.HIK_IP) {
  CONFIG.devices.push({
    name: 'terminal',
    ip: process.env.HIK_IP,
    port: Number(process.env.HIK_HTTP_PORT || 443),
    protocol: process.env.HIK_PROTOCOL || 'https',
    doorNo: Number(process.env.HIK_DOOR_NO || 1),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function md5(s) {
  const c = await import('node:crypto');
  return c.createHash('md5').update(s).digest('hex');
}

async function digestHeader(device, method, uri, wwwAuth) {
  const realm = /realm="([^"]+)"/.exec(wwwAuth)?.[1] || '';
  const nonce = /nonce="([^"]+)"/.exec(wwwAuth)?.[1] || '';
  const qopRaw = /qop="?([^"]+)"?/.exec(wwwAuth)?.[1] || '';
  const qop = qopRaw.split(',').map((s) => s.trim()).find((s) => s === 'auth') || qopRaw.split(',')[0]?.trim();
  const opaque = /opaque="([^"]+)"/.exec(wwwAuth)?.[1] || '';
  const username = device.username || CONFIG.username;
  const password = device.password || CONFIG.password;
  const ha1 = await md5(`${username}:${realm}:${password}`);
  const ha2 = await md5(`${method}:${uri}`);
  const nc = '00000001';
  const cnonce = Math.random().toString(16).slice(2, 10);
  const response = qop
    ? await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : await md5(`${ha1}:${nonce}:${ha2}`);
  let h = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) h += `, qop="${qop}", nc=${nc}, cnonce="${cnonce}"`;
  if (opaque) h += `, opaque="${opaque}"`;
  return h;
}

function collectResponse(res) {
  return new Promise((resolve) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    res.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({ statusCode: res.statusCode, headers: res.headers, buffer, body: buffer.toString('utf8') });
    });
  });
}

function requestDigest(device, method, uri, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const protocol = (device.protocol || 'https').toLowerCase();
    const client = protocol === 'https' ? https : http;
    const bodyHeaders = body
      ? { 'Content-Type': headers['Content-Type'] || 'application/json', 'Content-Length': Buffer.byteLength(body) }
      : {};
    const options = {
      host: device.ip,
      port: Number(device.port || (protocol === 'https' ? 443 : 80)),
      path: uri,
      method,
      rejectUnauthorized: false,
      headers: { ...headers, ...bodyHeaders },
    };
    const first = client.request(options, (res) => {
      if (res.statusCode !== 401) {
        collectResponse(res).then(resolve, reject);
        return;
      }
      const wwwAuth = res.headers['www-authenticate'] || '';
      collectResponse(res).then(() => digestHeader(device, method, uri, wwwAuth))
        .then((auth) => {
          const second = client.request({ ...options, headers: { ...options.headers, Authorization: auth } }, (res2) => {
            collectResponse(res2).then(resolve, reject);
          });
          second.setTimeout(10000);
          second.on('timeout', () => { second.destroy(); reject(new Error('Connection timeout (10s)')); });
          second.on('error', reject);
          if (body) second.write(body);
          second.end();
        }).catch(reject);
    });
    first.setTimeout(10000);
    first.on('timeout', () => { first.destroy(); reject(new Error('Connection timeout (10s)')); });
    first.on('error', reject);
    if (body) first.write(body);
    first.end();
  });
}

function assertOk(label, res) {
  if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
    const lockStatus = /<lockStatus>([^<]+)<\/lockStatus>/i.exec(res.body || '')?.[1];
    const unlockTime = Number(/<unlockTime>([^<]+)<\/unlockTime>/i.exec(res.body || '')?.[1] || 0);
    if (res.statusCode === 401 && lockStatus === 'lock') {
      const err = new Error(`${label} locked, wait ${unlockTime || 'unknown'}s`);
      err.code = 'HIKVISION_LOCKED';
      err.unlockTime = unlockTime;
      throw err;
    }
    throw new Error(`${label} ISAPI ${res.statusCode}: ${(res.body || '').slice(0, 220)}`);
  }
  return res;
}

function parseJsonSafe(text) {
  try { return JSON.parse(text || '{}'); } catch { return null; }
}

async function requestJson(device, method, uri, data) {
  const res = await requestDigest(device, method, uri, JSON.stringify(data), { 'Content-Type': 'application/json' });
  return assertOk(uri, res);
}

async function downloadPhoto(url) {
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'image/jpeg',
  };
}

async function deleteUser(device, employeeNo) {
  const body = { UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } };
  const res = await requestDigest(device, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', JSON.stringify(body), { 'Content-Type': 'application/json' });
  if (res.statusCode === 404) return;
  assertOk('delete-user', res);
}

async function upsertUser(device, student) {
  const now = new Date();
  const beginTime = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 19);
  const body = {
    UserInfo: {
      employeeNo: student.employeeNo,
      name: student.fullName,
      userType: 'normal',
      Valid: { enable: true, beginTime, endTime: '2037-12-31T23:59:59', timeType: 'local' },
      doorRight: device.doorRight || CONFIG.defaultDoorRight,
      RightPlan: [{ doorNo: Number(device.doorNo || 1), planTemplateNo: device.planTemplateNo || CONFIG.defaultPlanTemplateNo }],
    },
  };
  await requestJson(device, 'PUT', '/ISAPI/AccessControl/UserInfo/SetUp?format=json', body);
}

async function uploadFace(device, student) {
  if (!student.photoUrl) return 'no-photo';
  const photo = await downloadPhoto(student.photoUrl);
  const boundary = '----karasu' + Math.random().toString(16).slice(2);
  const record = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: student.employeeNo });
  const head =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="FaceDataRecord"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    `${record}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="FaceImage"; filename="${student.employeeNo}.jpg"\r\n` +
    `Content-Type: ${photo.contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), photo.buffer, Buffer.from(tail, 'utf8')]);
  const res = await requestDigest(device, 'POST', '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', body, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  });
  const data = parseJsonSafe(res.body);
  if (res.statusCode === 400 && data?.subStatusCode === 'deviceUserAlreadyExistFace') return 'already-exists';
  assertOk('face-upload', res);
  return 'uploaded';
}

async function fetchStudents() {
  const res = await fetch(`${CONFIG.serverUrl}/api/hikvision/students`, {
    headers: { 'x-device-key': CONFIG.deviceKey },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`server students ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.students || [];
}

function logStudentSummary(students) {
  const summary = students.reduce((acc, student) => {
    const key = student.enabled ? 'enabled' : (student.access_reason || 'disabled');
    acc[key] = (acc[key] || 0) + 1;
    if (!student.has_photo && !student.photoUrl) acc.no_photo = (acc.no_photo || 0) + 1;
    return acc;
  }, {});
  console.log(`[sync] summary ${JSON.stringify(summary)}`);

  students
    .filter((student) => !student.enabled)
    .slice(0, 30)
    .forEach((student) => {
      console.log(
        `[sync] skip ${student.employeeNo} ${student.fullName}: ` +
        `reason=${student.access_reason || 'disabled'}, ` +
        `paid=${student.current_month_paid || 0}, ` +
        `paidThisMonth=${student.paid_this_calendar_month || 0}, ` +
        `debt=${student.current_month_debt || 0}, ` +
        `photo=${student.has_photo || student.photoUrl ? 'yes' : 'no'}`
      );
    });
}

async function loadRemoteConfig() {
  const hasLocalDevices = CONFIG.devices.length > 0;
  const res = await fetch(`${CONFIG.serverUrl}/api/hikvision/config`, {
    headers: { 'x-device-key': CONFIG.deviceKey },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`server config ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!hasLocalDevices && Array.isArray(data.devices)) {
    CONFIG.devices = data.devices.filter((device) => device && device.ip);
  }
  if (Number(data.sync_interval_ms) > 0) {
    CONFIG.scheduleCheckIntervalMs = Number(data.sync_interval_ms);
  }
  if (typeof data.daily_sync_time === 'string' && /^\d{2}:\d{2}$/.test(data.daily_sync_time)) {
    CONFIG.dailySyncTime = data.daily_sync_time;
  }
}

async function syncDevice(device, students, reports) {
  let changed = 0;
  for (const student of students) {
    try {
      if (!student.enabled) {
        await deleteUser(device, student.employeeNo);
        changed += 1;
        const msg = `[${device.name}] deleted/disabled ${student.employeeNo} ${student.fullName} (${student.access_reason})`;
        console.log(msg);
        reports.push(msg);
        continue;
      }
      if (CONFIG.recreateUsersOnSync) {
        try {
          await deleteUser(device, student.employeeNo);
        } catch (e) {
          console.warn(`[${device.name}] delete-before-upsert ${student.employeeNo}: ${e.message}`);
        }
        await sleep(500);
      }
      await upsertUser(device, student);
      await sleep(500);
      const face = await uploadFace(device, student);
      changed += 1;
      const msg = `[${device.name}] upserted face=${face} ${student.employeeNo} ${student.fullName}`;
      console.log(msg);
      reports.push(msg);
    } catch (e) {
      const errMsg = `[${device.name}] ${student.employeeNo} ${student.fullName}: ${e.message}`;
      console.error(errMsg);
      reports.push(`ERROR: ${errMsg}`);
      if (e.code === 'HIKVISION_LOCKED') {
        reports.push(`ABORTED: Device ${device.name} is locked.`);
        break;
      }
    }
    await sleep(300);
  }
  return changed;
}

let syncInProgress = false;
async function runSync(reason = 'interval') {
  if (syncInProgress) {
    return 'Sync skipped: another sync is already in progress.';
  }
  syncInProgress = true;
  let logOutput = `[${new Date().toISOString()}] Sync started, reason=${reason}\n`;
  try {
    const students = await fetchStudents();
    logOutput += `Loaded ${students.length} student(s) from server.\n`;
    console.log(`[sync] ${students.length} student(s), reason=${reason}`);

    const summary = students.reduce((acc, student) => {
      const key = student.enabled ? 'enabled' : (student.access_reason || 'disabled');
      acc[key] = (acc[key] || 0) + 1;
      if (!student.has_photo && !student.photoUrl) acc.no_photo = (acc.no_photo || 0) + 1;
      return acc;
    }, {});
    logOutput += `Summary: ${JSON.stringify(summary)}\n`;
    logStudentSummary(students);

    for (const device of CONFIG.devices) {
      logOutput += `Syncing device: ${device.name || device.ip}...\n`;
      const reports = [];
      const changed = await syncDevice(device, students, reports);
      if (reports.length > 0) {
        logOutput += reports.map(line => `  ${line}`).join('\n') + '\n';
      }
      const finishedMsg = `Device ${device.name || device.ip}: applied ${changed} changes.\n`;
      console.log(`[sync] ` + finishedMsg.trim());
      logOutput += finishedMsg;
    }
    logOutput += `[${new Date().toISOString()}] Sync finished successfully.\n`;
    return logOutput;
  } catch (e) {
    const errorMsg = `[sync] failed: ${e.message}\n`;
    console.error(errorMsg.trim());
    logOutput += errorMsg;
    throw new Error(logOutput);
  } finally {
    syncInProgress = false;
  }
}

async function reportCommand(id, ok, result) {
  try {
    await fetch(`${CONFIG.serverUrl}/api/hikvision/commands/${encodeURIComponent(id)}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-key': CONFIG.deviceKey },
      body: JSON.stringify({ ok, result: String(result || '').slice(0, 10000) }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (e) {
    console.error('[command] report failed:', e.message);
  }
}

async function pollCommands() {
  try {
    const res = await fetch(`${CONFIG.serverUrl}/api/hikvision/commands/next`, {
      headers: { 'x-device-key': CONFIG.deviceKey },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`server command ${res.status}`);
    const data = await res.json();
    const command = data.command;
    if (!command) return;
    if (command.type === 'HIKVISION_SYNC') {
      try {
        const logResult = await runSync(command.payload?.reason || 'command');
        await reportCommand(command.id, true, logResult);
      } catch (err) {
        await reportCommand(command.id, false, err.message);
      }
    } else {
      await reportCommand(command.id, false, `unknown command ${command.type}`);
    }
  } catch (e) {
    console.error('[command] failed:', e.message);
  }
}

function getTashkentNow() {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

let lastDailySyncDate = '';
async function checkDailySchedule() {
  const now = getTashkentNow();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const today = now.toISOString().slice(0, 10);
  if (`${hh}:${mm}` !== CONFIG.dailySyncTime || lastDailySyncDate === today) return;
  lastDailySyncDate = today;
  try {
    await runSync(`daily-${CONFIG.dailySyncTime}-Asia/Tashkent`);
  } catch (e) {
    console.error('Daily sync failed:', e.message);
  }
}

async function main() {
  if (!CONFIG.deviceKey) {
    console.error('DEVICE_INGEST_KEY is required');
    process.exit(1);
  }
  await loadRemoteConfig();
  if (!CONFIG.devices.length) {
    console.error('Set terminals in website Hikvision settings, HIK_DEVICES_JSON, or HIK_IP');
    process.exit(1);
  }
  console.log(`[bridge] ${CONFIG.devices.length} Hikvision terminal(s) -> ${CONFIG.serverUrl}`);
  console.log(`[bridge] command polling ${CONFIG.commandPollIntervalMs}ms, daily full sync ${CONFIG.dailySyncTime} Asia/Tashkent`);
  // Запускаем стартовую синхронизацию в фоновом режиме (без await), чтобы не блокировать опрос команд
  runSync('startup').catch((e) => {
    console.error('Startup sync failed:', e.message);
  });
  setInterval(checkDailySchedule, CONFIG.scheduleCheckIntervalMs);
  setInterval(pollCommands, CONFIG.commandPollIntervalMs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
