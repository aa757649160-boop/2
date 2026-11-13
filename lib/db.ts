import postgres from 'postgres';

const sql = postgres({
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  username: process.env.PGUSER,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
  ssl: 'require',
});

export type RechargeRequest = {
  id: number;
  user_id: string;
  amount: number;
  points: number;
  status: string;
  created_at: Date;
  username: string;
  screenshot_url: string;
};

export type PointDeduction = {
  id: number;
  user_id: string;
  amount: number;
  description: string;
  created_at: Date;
};

async function initTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      points DOUBLE PRECISION DEFAULT 0.5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS recharges (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      points INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      screenshot_url TEXT,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `;

  // 新增验证码表
  await sql`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false
    )
  `;

  // 新增：验证码错误尝试次数（老库自动补列，5 次即作废）
  await sql`
    ALTER TABLE verification_codes
    ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0
  `;

  // 新增：验证码发送记录（按邮箱/IP 限频）
  await sql`
    CREATE TABLE IF NOT EXISTS code_requests (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      ip TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // 新增积分扣费历史表
  await sql`
    CREATE TABLE IF NOT EXISTS point_deductions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `;

  // 异步任务登记表：记录建任务时扣的积分，任务失败时据此自动退回（同一任务只退一次）
  await sql`
    CREATE TABLE IF NOT EXISTS async_tasks (
      task_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      points DOUBLE PRECISION NOT NULL,
      kind TEXT NOT NULL,
      model TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      refunded_at TIMESTAMP
    )
  `;
}

// 初始化数据库
initTables().catch(console.error);

export async function getUserPoints(userId: string) {
  const user = await sql`
    SELECT points FROM users WHERE user_id = ${userId}
  `;

  if (user.length === 0) {
    throw new Error('User not found');
  }

  return user[0].points;
}

export async function updateUserPoints(userId: string, points: number) {
  await sql`
    UPDATE users SET points = points + ${points} WHERE user_id = ${userId}
  `;
}

// 扣减用户积分 - 修复：返回boolean，匹配原来的接口调用，新增description参数记录扣费内容
export async function deductUserPoints(userId: string, points: number, description: string) {
  const currentPoints = await getUserPoints(userId);

  if (currentPoints < points) {
    return false; // 积分不足，返回false
  }

  await sql`
    UPDATE users SET points = points - ${points} WHERE user_id = ${userId}
  `;

  // 记录扣费历史
  await sql`
    INSERT INTO point_deductions (user_id, amount, description)
    VALUES (${userId}, ${points}, ${description})
  `;

  return true; // 扣减成功，返回true
}

// 获取用户的扣费历史
export async function getUserDeductions(userId: string) {
  return await sql<PointDeduction[]>`
    SELECT * FROM point_deductions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

/**
 * 登记异步任务（建任务并扣分后调用），用于后续失败自动退分
 * kind: 'image' | 'video'
 */
export async function recordAsyncTask(input: {
  taskId: string;
  userId: string;
  points: number;
  kind: string;
  model?: string;
}) {
  const { taskId, userId, points, kind, model } = input;
  if (!taskId || !userId || !(points > 0)) return;
  await sql`
    INSERT INTO async_tasks (task_id, user_id, points, kind, model, status)
    VALUES (${taskId}, ${userId}, ${points}, ${kind}, ${model || ''}, 'pending')
    ON CONFLICT (task_id) DO NOTHING
  `;
}

/**
 * 异步任务失败退积分：只有登记过、且没退过的任务才退，天然幂等（前端反复轮询也只退一次）
 * 返回是否真的退了
 */
export async function refundAsyncTask(taskId: string, reason?: string): Promise<boolean> {
  if (!taskId) return false;

  // 先抢占状态，避免并发轮询重复退款
  const rows = await sql`
    UPDATE async_tasks
    SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP
    WHERE task_id = ${taskId} AND status <> 'refunded'
    RETURNING user_id, points, kind, model
  `;
  if (rows.length === 0) return false;

  const row: any = rows[0];
  const points = Number(row.points) || 0;
  const userId = String(row.user_id || '');
  if (!userId || !(points > 0)) return false;

  await sql`
    UPDATE users SET points = points + ${points} WHERE user_id = ${userId}
  `;

  const kindText = row.kind === 'video' ? '视频' : '图片';
  let description = `退回积分：${kindText}任务失败（${row.model || ''}）`;
  if (reason) description += ` ${String(reason).substring(0, 80)}`;

  try {
    await sql`
      INSERT INTO point_deductions (user_id, amount, description)
      VALUES (${userId}, ${points}, ${description})
    `;
  } catch (e) {
    console.warn('[refund] 记录退分历史失败（积分已退回）:', (e as any)?.message);
  }

  console.log('[refund] 已退积分', points, '给', userId, '任务', taskId);
  return true;
}

export async function registerUser(username: string, password: string) {
  const userId = 'user_' + Math.random().toString(36).slice(2);

  // 密码在服务端哈希后才落库：前端只传明文（HTTPS），不再传 bcrypt 哈希
  const passwordHash = await require('bcryptjs').hash(password, 10);

  await sql`
    INSERT INTO users (user_id, username, password)
    VALUES (${userId}, ${username}, ${passwordHash})
  `;

  return userId;
}

export async function loginUser(username: string, password: string) {
  const user = await sql`
    SELECT * FROM users WHERE username = ${username}
  `;

  if (user.length === 0) {
    throw new Error('User not found');
  }

  const valid = await require('bcryptjs').compare(password, user[0].password);
  if (!valid) {
    throw new Error('Invalid password');
  }

  return user[0].user_id;
}

// 保存验证码（同一邮箱只保留最新一条，旧码立即失效）
export async function saveVerificationCode(email: string, code: string) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟过期

  await sql`
    UPDATE verification_codes
    SET used = true
    WHERE email = ${email} AND used = false
  `;

  await sql`
    INSERT INTO verification_codes (email, code, expires_at, attempts)
    VALUES (${email}, ${code}, ${expiresAt}, 0)
  `;
}

// 验证验证码：同一邮箱只认最新一条，累计错 5 次即作废
export async function verifyCode(email: string, code: string) {
  const result = await sql`
    SELECT id, code, attempts FROM verification_codes
    WHERE email = ${email} AND expires_at > NOW() AND used = false
    ORDER BY id DESC
    LIMIT 1
  `;

  if (result.length === 0) {
    return false;
  }

  const row = result[0];
  const attempts = Number(row.attempts) || 0;

  // 已经错满 5 次，作废
  if (attempts >= 5) {
    await sql`
      UPDATE verification_codes SET used = true WHERE id = ${row.id}
    `;
    return false;
  }

  if (String(row.code).trim() !== String(code).trim()) {
    const next = attempts + 1;
    await sql`
      UPDATE verification_codes
      SET attempts = ${next}, used = ${next >= 5}
      WHERE id = ${row.id}
    `;
    return false;
  }

  // 正确即消费掉
  await sql`
    UPDATE verification_codes
    SET used = true
    WHERE id = ${row.id}
  `;

  return true;
}

// 记录一次验证码发送（用于限频）
export async function recordCodeRequest(email: string, ip: string | null) {
  await sql`
    INSERT INTO code_requests (email, ip)
    VALUES (${email}, ${ip})
  `;
}

// 统计指定时间窗内该邮箱的发送次数
export async function countRecentCodeRequestsByEmail(email: string, minutes: number) {
  const rows = await sql`
    SELECT COUNT(*)::int AS c FROM code_requests
    WHERE email = ${email} AND created_at > NOW() - make_interval(mins => ${minutes})
  `;
  return Number(rows[0]?.c) || 0;
}

// 统计指定时间窗内该 IP 的发送次数
export async function countRecentCodeRequestsByIp(ip: string, minutes: number) {
  const rows = await sql`
    SELECT COUNT(*)::int AS c FROM code_requests
    WHERE ip = ${ip} AND created_at > NOW() - make_interval(mins => ${minutes})
  `;
  return Number(rows[0]?.c) || 0;
}

// 距离该邮箱下一次可发送还剩多少秒（用于提示）
export async function secondsUntilEmailCanRequest(email: string) {
  const rows = await sql`
    SELECT EXTRACT(EPOCH FROM (MAX(created_at) + INTERVAL '60 seconds' - NOW()))::int AS remain
    FROM code_requests
    WHERE email = ${email} AND created_at > NOW() - INTERVAL '60 seconds'
  `;
  const remain = Number(rows[0]?.remain) || 0;
  return remain > 0 ? remain : 0;
}


// 创建充值请求 - 修复：接收screenshot属性，匹配原来的接口调用
export async function createRechargeRequest({
  userId,
  amount,
  points,
  screenshot
}: {
  userId: string;
  amount: number;
  points: number;
  screenshot: string;
}) {
  await sql`
    INSERT INTO recharges (user_id, amount, points, screenshot_url)
    VALUES (${userId}, ${amount}, ${points}, ${screenshot})
  `;
}

// 获取所有充值记录
export async function getAllRecharges() {
  return await sql`
    SELECT r.*, u.username FROM recharges r
    JOIN users u ON r.user_id = u.user_id
    ORDER BY r.created_at DESC
  `;
}

export async function getPendingRecharges() {
  return await sql`
    SELECT r.*, u.username FROM recharges r
    JOIN users u ON r.user_id = u.user_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at DESC
  `;
}

// 修复：只需要id一个参数，函数内部自己查recharge信息
export async function approveRecharge(id: number) {
  // 先查询这个recharge的信息
  const recharge = await sql`
    SELECT * FROM recharges WHERE id = ${id}
  `;

  if (recharge.length === 0) {
    throw new Error('Recharge not found');
  }

  const { user_id, points } = recharge[0];

  // 更新充值状态
  await sql`
    UPDATE recharges SET status = 'approved' WHERE id = ${id}
  `;

  // 给用户加积分
  await updateUserPoints(user_id, points);
}

// 拒绝充值
export async function rejectRecharge(id: number) {
  await sql`
    UPDATE recharges SET status = 'rejected' WHERE id = ${id}
  `;
}

export default sql;
