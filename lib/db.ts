import { sql } from '@vercel/postgres';
import crypto from 'crypto';

// 用户积分操作
export async function getUserPoints(userId: string): Promise<number> {
  // 初始化表结构
  await initTables();
  
  const result = await sql`
    SELECT points FROM users WHERE user_id = ${userId}
  `;
  
  if (result.rows.length === 0) {
    // 用户不存在，创建新用户，默认100积分
    await sql`
      INSERT INTO users (user_id, points, created_at, updated_at)
      VALUES (${userId}, 100, NOW(), NOW())
    `;
    return 100;
  }
  
  return Number(result.rows[0].points);
}

export async function updateUserPoints(userId: string, points: number) {
  await initTables();
  
  await sql`
    INSERT INTO users (user_id, points, created_at, updated_at)
    VALUES (${userId}, ${points}, NOW(), NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      points = users.points + ${points},
      updated_at = NOW()
  `;
}

export async function deductUserPoints(userId: string, points: number): Promise<boolean> {
  await initTables();
  
  const current = await getUserPoints(userId);
  if (current < points) {
    return false;
  }
  
  await sql`
    UPDATE users 
    SET points = points - ${points}, updated_at = NOW()
    WHERE user_id = ${userId}
  `;
  
  return true;
}

// 用户认证相关
export async function getUserByUsername(username: string) {
  await initTables();
  
  const result = await sql`
    SELECT * FROM users WHERE username = ${username}
  `;
  
  return result.rows[0] || null;
}

export async function createUser(username: string, passwordHash: string) {
  await initTables();
  
  // 生成唯一的用户ID
  const userId = crypto.randomUUID();
  
  await sql`
    INSERT INTO users (user_id, username, password_hash, points, created_at, updated_at)
    VALUES (${userId}, ${username}, ${passwordHash}, 100, NOW(), NOW())
  `;
  
  return {
    id: userId,
    username: username,
  };
}

// 充值记录操作
export type RechargeRequest = {
  id: number;
  user_id: string;
  amount: number;
  points: number;
  screenshot_url: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};
export async function createRechargeRequest(request: {
  userId: string;
  amount: number;
  points: number;
  screenshot: string;
}) {
  await initTables();
  
  const result = await sql`
    INSERT INTO recharges (user_id, amount, points, screenshot_url, status, created_at, updated_at)
    VALUES (${request.userId}, ${request.amount}, ${request.points}, ${request.screenshot}, 'pending', NOW(), NOW())
    RETURNING id
  `;
  
  return result.rows[0];
}
export async function getPendingRecharges(): Promise<RechargeRequest[]> {
  await initTables();
  
  const result = await sql`
    SELECT * FROM recharges 
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `;
  
  return result.rows as RechargeRequest[];
}
export async function getAllRecharges(): Promise<RechargeRequest[]> {
  await initTables();
  
  const result = await sql`
    SELECT * FROM recharges
    ORDER BY created_at DESC
  `;
  
  return result.rows as RechargeRequest[];
}
export async function approveRecharge(id: number) {
  await initTables();
  
  // 先获取充值记录
  const request = await sql`
    SELECT * FROM recharges WHERE id = ${id}
  `;
  
  if (request.rows.length === 0) {
    throw new Error('充值记录不存在');
  }
  
  const recharge = request.rows[0] as RechargeRequest;
  if (recharge.status !== 'pending') {
    throw new Error('该记录已处理');
  }
  
  // 更新用户积分
  await updateUserPoints(recharge.user_id, recharge.points);
  
  // 更新充值状态
  await sql`
    UPDATE recharges 
    SET status = 'approved', updated_at = NOW()
    WHERE id = ${id}
  `;
  
  return recharge;
}
export async function rejectRecharge(id: number) {
  await initTables();
  
  const request = await sql`
    SELECT * FROM recharges WHERE id = ${id}
  `;
  
  if (request.rows.length === 0) {
    throw new Error('充值记录不存在');
  }
  
  const recharge = request.rows[0] as RechargeRequest;
  if (recharge.status !== 'pending') {
    throw new Error('该记录已处理');
  }
  
  await sql`
    UPDATE recharges 
    SET status = 'rejected', updated_at = NOW()
    WHERE id = ${id}
  `;
  
  return recharge;
}

// 初始化数据库表
async function initTables() {
  // 创建 users 表，新增username和password_hash字段用于认证
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      points NUMERIC NOT NULL DEFAULT 100,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  
  // 创建 recharges 表
  await sql`
    CREATE TABLE IF NOT EXISTS recharges (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      amount INTEGER NOT NULL,
      points INTEGER NOT NULL,
      screenshot_url TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
}
