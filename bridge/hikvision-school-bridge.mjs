/**
 * Local Hikvision bridge for the football school.
 *
 * Runs near the terminals, pulls allowed students from the cloud, and writes
 * them into one or more Hikvision Face ID terminals.
 */

import http from 'node:http';
import https from 'node:https';
import os from 'node:os';

const CONFIG = {
  serverUrl: process.env.SERVER_URL || 'https://proapp.up.railway.app',
  deviceKey: process.env.DEVICE_INGEST_KEY || '',
  username: process.env.HIK_USER || 'admin',
  password: process.env.HIK_PASS || '',
  dailySyncTime: process.env.HIK_DAILY_SYNC_TIME || '03:00',
  scheduleCheckIntervalMs: Number(process.env.HIK_SCHEDULE_CHECK_INTERVAL_MS || 30000),
  commandPollIntervalMs: Number(process.env.COMMAND_POLL_INTERVAL_MS || 2000),
  deviceRequestTimeoutMs: Number(process.env.HIK_REQUEST_TIMEOUT_MS || 10000),
  deviceProbeTimeoutMs: Number(process.env.HIK_PROBE_TIMEOUT_MS || 2500),
  offlineBackoffMs: Number(process.env.HIK_OFFLINE_BACKOFF_MS || 60000),
  heartbeatIntervalMs: Number(process.env.BRIDGE_HEARTBEAT_INTERVAL_MS || 5000),
  bridgeId: process.env.BRIDGE_ID || 'hikvision-school-bridge',
  defaultDoorRight: process.env.HIK_DOOR_RIGHT || '1',
  defaultPlanTemplateNo: process.env.HIK_PLAN_TEMPLATE_NO || '1',
  recreateUsersOnSync: (process.env.HIK_SYNC_RECREATE_USERS || 'false') === 'true',
  devices: JSON.parse(process.env.HIK_DEVICES_JSON || '[]'),
};

const deviceOfflineUntil = new Map();
const startTime = Date.now();
const liveLogs = [];
let currentCommandId = null;
let currentAction = 'idle';
let lastHeartbeatAt = 0;
let currentProgress = null;

function rememberLog(level, args) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message: args.map((arg) => {
      if (typeof arg === 'string') return arg;
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }).join(' '),
  };
  liveLogs.push(line);
  if (liveLogs.length > 500) liveLogs.splice(0, liveLogs.length - 500);
}

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

console.log = (...args) => { rememberLog('LOG', args); originalConsole.log(...args); };
console.warn = (...args) => { rememberLog('WARN', args); originalConsole.warn(...args); };
console.error = (...args) => { rememberLog('ERROR', args); originalConsole.error(...args); };

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

function getMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    cpu_load_1m: Number((os.loadavg()[0] || 0).toFixed(2)),
    memory_used_percent: totalMem ? Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1)) : 0,
    memory_used_mb: Math.round((totalMem - freeMem) / 1024 / 1024),
    memory_total_mb: Math.round(totalMem / 1024 / 1024),
    node_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    progress: currentProgress,
  };
}

async function sendHeartbeat(force = false) {
  const now = Date.now();
  if (!force && now - lastHeartbeatAt < CONFIG.heartbeatIntervalMs) return;
  lastHeartbeatAt = now;
  try {
    await fetch(`${CONFIG.serverUrl}/api/hikvision/bridge/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-key': CONFIG.deviceKey },
      body: JSON.stringify({
        bridge_id: CONFIG.bridgeId,
        status: currentAction === 'idle' ? 'online' : 'busy',
        host: os.hostname(),
        pid: process.pid,
        version: process.version,
        uptime_seconds: Math.round((Date.now() - startTime) / 1000),
        current_command_id: currentCommandId,
        current_action: currentAction,
        metrics: getMetrics(),
        logs: liveLogs,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    originalConsole.error('[heartbeat] failed:', error.message);
  }
}

function setAction(action) {
  currentAction = action || 'idle';
  sendHeartbeat(true);
}

function setProgress(patch = null) {
  if (!patch) {
    currentProgress = null;
  } else {
    const next = { ...(currentProgress || {}), ...patch };
    const total = Number(next.total || 0);
    const processed = Number(next.processed || 0);
    next.percent = total > 0 ? Math.min(100, Math.max(0, Math.round((processed / total) * 100))) : 0;
    currentProgress = next;
  }
  sendHeartbeat(true);
}

function reasonLabel(reason) {
  const labels = {
    startup: 'Запуск bridge',
    manual: 'Ручная синхронизация',
    staff_created: 'Добавлен сотрудник',
    staff_updated: 'Сотрудник обновлен',
    staff_deleted: 'Сотрудник удален',
    student_created: 'Новый ученик',
    student_updated: 'Ученик обновлен',
    student_deleted: 'Ученик удален',
    payment_added: 'Добавлена оплата',
    payment_updated: 'Оплата обновлена',
    payment_deleted: 'Оплата удалена',
    payment_refunded: 'Возврат оплаты',
    monthly_payment_added: 'Месячная оплата',
    settings_updated: 'Обновлены настройки',
    command: 'Команда из очереди',
    interval: 'Плановая проверка',
  };
  return labels[reason] || reason;
}

function deviceLabel(device) {
  const name = device.name === 'entry' ? 'Вход' : device.name === 'exit' ? 'Выход' : (device.name || 'Терминал');
  return `${name} (${device.ip}:${device.port || 443})`;
}

function accessReasonLabel(reason) {
  const labels = {
    no_photo: 'нет фото',
    disabled: 'доступ закрыт',
    inactive: 'ученик неактивен',
    unpaid: 'нет оплаты',
    blocked: 'заблокирован',
  };
  return labels[reason] || reason || 'доступ закрыт';
}

function humanError(error) {
  const message = String(error?.message || error || '');
  const code = error?.code || error?.cause?.code || '';
  if (code === 'EHOSTUNREACH' || message.includes('EHOSTUNREACH')) return 'терминал недоступен по сети';
  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) return 'терминал отклонил подключение';
  if (code === 'ETIMEDOUT' || message.includes('ETIMEDOUT') || message.includes('Connection timeout')) return 'терминал не ответил вовремя';
  if (code === 'ECONNRESET' || message.includes('ECONNRESET') || message.includes('fetch failed')) return 'соединение с терминалом оборвалось';
  if (code === 'HIKVISION_LOCKED') return `терминал временно заблокирован${error.unlockTime ? `, ждать ${error.unlockTime} сек` : ''}`;
  if (message.includes('401')) return 'неверный логин или пароль Hikvision';
  if (message.includes('403')) return 'терминал запретил операцию';
  if (message.includes('404')) return 'терминал не нашел нужный ISAPI метод';
  return message;
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

function getDeviceKey(device) {
  return `${device.name || 'terminal'}@${device.ip}:${device.port || ((device.protocol || 'https') === 'https' ? 443 : 80)}`;
}

function requestDigest(device, method, uri, body = null, headers = {}, timeoutMs = CONFIG.deviceRequestTimeoutMs) {
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
          second.setTimeout(timeoutMs);
          second.on('timeout', () => { second.destroy(); reject(new Error(`Connection timeout (${Math.round(timeoutMs / 1000)}s)`)); });
          second.on('error', reject);
          if (body) second.write(body);
          second.end();
        }).catch(reject);
    });
    first.setTimeout(timeoutMs);
    first.on('timeout', () => { first.destroy(); reject(new Error(`Connection timeout (${Math.round(timeoutMs / 1000)}s)`)); });
    first.on('error', reject);
    if (body) first.write(body);
    first.end();
  });
}

function isNetworkError(error) {
  const message = String(error?.message || '');
  return (
    error?.code === 'EHOSTUNREACH' ||
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ENETUNREACH' ||
    error?.code === 'ECONNRESET' ||
    message.includes('EHOSTUNREACH') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENETUNREACH') ||
    message.includes('Connection timeout')
  );
}

async function probeDevice(device) {
  const key = getDeviceKey(device);
  const now = Date.now();
  const offlineUntil = deviceOfflineUntil.get(key) || 0;
  if (offlineUntil > now) {
    return {
      ok: false,
      skipped: true,
      message: `offline backoff active for ${Math.ceil((offlineUntil - now) / 1000)}s`,
    };
  }

  try {
    const res = await requestDigest(device, 'GET', '/ISAPI/System/deviceInfo', null, {}, CONFIG.deviceProbeTimeoutMs);
    assertOk('device-probe', res);
    deviceOfflineUntil.delete(key);
    return { ok: true };
  } catch (error) {
    if (isNetworkError(error)) {
      deviceOfflineUntil.set(key, now + CONFIG.offlineBackoffMs);
    }
    return { ok: false, message: error.message || String(error), code: error.code || error.cause?.code || 'probe_failed' };
  }
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
        `paymentExempt=${student.access_exempt_from_payment ? 'yes' : 'no'}, ` +
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
  let processed = 0;
  const deviceName = deviceLabel(device);
  const stats = {
    upserted: 0,
    deleted: 0,
    skippedDisabled: 0,
    errors: 0,
    errorTypes: {},
  };

  setAction(`Проверка терминала ${deviceName}`);
  setProgress({ stage: 'probe', device: deviceName, status_text: `Проверяем связь с терминалом ${deviceName}` });
  const probe = await probeDevice(device);
  if (!probe.ok) {
    stats.errors += 1;
    stats.errorTypes[probe.code || 'DEVICE_OFFLINE'] = 1;
    const msg = `[${device.name || device.ip}] Терминал недоступен: запись пропущена. Причина: ${humanError(probe.message)}`;
    console.warn(msg);
    reports.push(msg);
    reports.push(`Проверьте питание и сеть терминала ${device.ip}:${device.port || 443}. Bridge повторит попытку через ${Math.round(CONFIG.offlineBackoffMs / 1000)} сек.`);
    reports.unshift(`[${device.name || device.ip}] summary ${JSON.stringify(stats)}`);
    return changed;
  }
  console.log(`[${device.name || device.ip}] Связь с терминалом есть. Начинаем запись ${students.length} записей.`);

  for (const student of students) {
    processed += 1;
    const studentTitle = `${student.employeeNo} ${student.fullName}`;
    setProgress({
      stage: 'sync',
      device: deviceName,
      total: students.length,
      processed,
      success: stats.upserted + stats.deleted,
      errors: stats.errors,
      skipped: stats.skippedDisabled,
      current: studentTitle,
      status_text: `${deviceName}: ${processed} из ${students.length} - ${studentTitle}`,
    });
    try {
      setAction(`${deviceName}: ${student.enabled ? 'записываем' : 'блокируем'} ${studentTitle}`);
      if (!student.enabled) {
        stats.skippedDisabled += 1;
        await deleteUser(device, student.employeeNo);
        changed += 1;
        stats.deleted += 1;
        const msg = `[${device.name}] Доступ закрыт: ${studentTitle}. Причина: ${accessReasonLabel(student.access_reason)}`;
        console.log(msg);
        reports.push(msg);
        continue;
      }
      if (CONFIG.recreateUsersOnSync) {
        try {
          await deleteUser(device, student.employeeNo);
        } catch (e) {
          console.warn(`[${device.name}] Не удалось удалить старую запись перед обновлением ${studentTitle}: ${humanError(e)}`);
        }
        await sleep(500);
      }
      await upsertUser(device, student);
      await sleep(500);
      const face = await uploadFace(device, student);
      changed += 1;
      stats.upserted += 1;
      const faceText = face === 'already-exists' ? 'фото уже было в терминале' : 'фото записано';
      const msg = `[${device.name}] Записан в терминал: ${studentTitle} (${faceText})`;
      console.log(msg);
      reports.push(msg);
    } catch (e) {
      stats.errors += 1;
      const errKey = e.code || e.cause?.code || e.message.split(':')[0] || 'error';
      stats.errorTypes[errKey] = (stats.errorTypes[errKey] || 0) + 1;
      const errMsg = `[${device.name}] Ошибка записи: ${studentTitle}. Причина: ${humanError(e)}`;
      console.error(errMsg);
      reports.push(`ОШИБКА: ${errMsg}`);
      if (e.message.includes('EHOSTUNREACH') || e.code === 'EHOSTUNREACH') {
        reports.push(`СЕТЬ: ${deviceName} недоступен с mini PC. Проверьте питание, кабель и IP ${device.ip}:${device.port || 443}.`);
      }
      if (e.code === 'HIKVISION_LOCKED') {
        reports.push(`ОСТАНОВЛЕНО: терминал ${deviceName} временно заблокирован.`);
        break;
      }
    }
    await sleep(300);
  }
  setProgress({
    stage: 'device_done',
    device: deviceName,
    total: students.length,
    processed: students.length,
    success: stats.upserted + stats.deleted,
    errors: stats.errors,
    skipped: stats.skippedDisabled,
    status_text: `${deviceName}: готово. Успешно ${stats.upserted + stats.deleted}, ошибок ${stats.errors}.`,
  });
  setAction(`Терминал ${deviceName}: готово`);
  reports.unshift(`[${device.name || device.ip}] summary ${JSON.stringify(stats)}`);
  return changed;
}

let syncInProgress = false;
async function runSync(reason = 'interval', commandId = null) {
  if (syncInProgress) {
    return 'Sync skipped: another sync is already in progress.';
  }
  syncInProgress = true;
  currentCommandId = commandId;
  setProgress({ stage: 'start', reason: reasonLabel(reason), total: 0, processed: 0, status_text: `Начинаем синхронизацию: ${reasonLabel(reason)}` });
  setAction(`Запуск синхронизации: ${reasonLabel(reason)}`);
  let logOutput = `[${new Date().toISOString()}] Синхронизация начата. Причина: ${reasonLabel(reason)}\n`;

  let localCommandId = commandId;
  if (!localCommandId) {
    try {
      const res = await fetch(`${CONFIG.serverUrl}/api/hikvision/commands/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-key': CONFIG.deviceKey },
        body: JSON.stringify({ reason }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          localCommandId = data.command_id;
          currentCommandId = localCommandId;
          sendHeartbeat(true);
        }
      }
    } catch (e) {
      console.warn('[sync] failed to register local command in db:', e.message);
    }
  }

  try {
    setAction('Загрузка списка учеников и сотрудников с сервера');
    setProgress({ stage: 'loading', status_text: 'Загружаем список учеников и сотрудников с сервера' });
    const students = await fetchStudents();
    logOutput += `Получено записей с сервера: ${students.length}.\n`;
    console.log(`[sync] Получено записей с сервера: ${students.length}. Причина: ${reasonLabel(reason)}.`);

    const summary = students.reduce((acc, student) => {
      const key = student.enabled ? 'enabled' : (student.access_reason || 'disabled');
      acc[key] = (acc[key] || 0) + 1;
      if (!student.has_photo && !student.photoUrl) acc.no_photo = (acc.no_photo || 0) + 1;
      return acc;
    }, {});
    logOutput += `Summary: ${JSON.stringify(summary)}\n`;
    logStudentSummary(students);

    for (const device of CONFIG.devices) {
      setAction(`Синхронизация терминала ${deviceLabel(device)}`);
      setProgress({
        stage: 'device_start',
        device: deviceLabel(device),
        total: students.length,
        processed: 0,
        status_text: `Начинаем запись в терминал ${deviceLabel(device)}`,
      });
      logOutput += `Терминал: ${deviceLabel(device)} (${device.protocol || 'https'}://${device.ip}:${device.port || 443}).\n`;
      const reports = [];
      const changed = await syncDevice(device, students, reports);
      if (reports.length > 0) {
        logOutput += reports.map(line => `  ${line}`).join('\n') + '\n';
      }
      const finishedMsg = `Терминал ${deviceLabel(device)}: применено изменений ${changed}.\n`;
      console.log(`[sync] ` + finishedMsg.trim());
      logOutput += finishedMsg;
    }
    setProgress({ stage: 'done', total: students.length, processed: students.length, percent: 100, status_text: 'Синхронизация завершена успешно' });
    logOutput += `[${new Date().toISOString()}] Синхронизация завершена успешно.\n`;

    if (localCommandId) {
      await reportCommand(localCommandId, true, logOutput);
    }
    return logOutput;
  } catch (e) {
    setProgress({ stage: 'error', status_text: `Синхронизация завершилась с ошибкой: ${humanError(e)}` });
    const errorMsg = `[sync] Ошибка синхронизации: ${humanError(e)}\n`;
    console.error(errorMsg.trim());
    logOutput += errorMsg;

    if (localCommandId) {
      await reportCommand(localCommandId, false, logOutput);
    }
    throw new Error(logOutput);
  } finally {
    syncInProgress = false;
    currentCommandId = null;
    setAction('idle');
  }
}

async function reportCommand(id, ok, result) {
  try {
    await fetch(`${CONFIG.serverUrl}/api/hikvision/commands/${encodeURIComponent(id)}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-key': CONFIG.deviceKey },
      body: JSON.stringify({ ok, result: String(result || '').slice(0, 50000) }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (e) {
    console.error('[command] report failed:', e.message);
  }
}

async function pollCommands() {
  try {
    await sendHeartbeat();
    if (syncInProgress) return;
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
        currentCommandId = command.id;
        setAction(`Команда из очереди #${command.id}`);
        await runSync(command.payload?.reason || 'command', command.id);
      } catch (err) {
        // Ошибка уже отправлена внутри runSync
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
  setAction('idle');
  setInterval(() => sendHeartbeat(), CONFIG.heartbeatIntervalMs);
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
