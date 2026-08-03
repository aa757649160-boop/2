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

export async function registerUser(username: string, password: string) {
  const userId = 'user_' + Math.random().toString(36).slice(2);

  await sql`
    INSERT INTO users (user_id, username, password)
    VALUES (${userId}, ${username}, ${password})
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

// 保存验证码
export async function saveVerificationCode(email: string, code: string) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 100); // 5分钟过期
  await sql`
    INSERT INTO verification_codes (email, code, expires_at)
    VALUES (${email}, ${code}, ${expiresAt})
  `;
}

// 验证验证码
export async function verifyCode(email: string, code: string) {
  const result = await sql`
    SELECT * FROM verification_codes
    WHERE email = ${email} AND code = ${code} AND expires_at > NOW() AND used = false
  `;

  if (result.length === 0) {
    return false;
  }

  // 标记为已使用
  await sql`
    UPDATE verification_codes
    SET used = true
    WHERE id = ${result[0].id}
  `;

  return true;
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
