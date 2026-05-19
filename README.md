# AI应用平台

这是一个基于Vercel部署的AI应用平台，支持主备API自动切换、会员积分系统、人工审核充值等功能。

## 功能特性

- ✅ 支持AI聊天和图片生成
- ✅ 主备API自动故障切换
- ✅ 会员积分系统
- ✅ 固定金额充值，人工审核
- ✅ API Key保护，不会泄露给前端
- ✅ 一键部署到Vercel

## 快速部署

### 一键部署
点击下方按钮一键部署到Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faa757649160-boop%2Fhuituwangz&env=MAIN_API_KEY,BACKUP_API_KEY,ADMIN_USER_ID)

### 手动部署

1. Fork 这个仓库到你的GitHub账号
2. 在Vercel中导入这个项目
3. 配置环境变量（见下方）
4. 部署完成！

## 配置说明

### 环境变量
在Vercel项目设置中，添加以下环境变量：

- `MAIN_API_KEY`: 主API平台(ai.comfly.chat)的API Key
- `BACKUP_API_KEY`: 备用API平台(grsai.com)的API Key
- `ADMIN_USER_ID`: 管理员用户ID，默认是 `admin`

### 修改模型价格
所有模型的价格配置都在 `lib/config.ts` 文件中：

```typescript
// 模型价格配置 (每千token价格，单位：积分)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'gpt-4': { input: 3, output: 6 },
  // 在这里添加或修改模型价格
};
```

你可以直接修改这个文件中的价格，然后推送到GitHub，Vercel会自动重新部署。

### 上传收款码
1. 将你的收款码图片重命名为 `payment_qrcode.png`
2. 把图片放到 `public/qrcode/` 目录下
3. 如果你的图片名字不同，可以修改 `lib/config.ts` 中的 `PAYMENT_QRCODE` 配置：

```typescript
export const PAYMENT_QRCODE = '/qrcode/your_qrcode_filename.png';
```

### 修改充值档位
充值档位也在 `lib/config.ts` 文件中：

```typescript
export const RECHARGE_OPTIONS = [
  { amount: 10, points: 1000, label: '10元 = 1000积分' },
  { amount: 20, points: 2200, label: '20元 = 2200积分' },
  // 在这里添加或修改充值档位
];
```

## 管理员使用说明

1. 要进入管理后台，你需要将你的用户ID设置为 `admin`
2. 打开浏览器的开发者工具，在控制台输入：
   ```javascript
   localStorage.setItem('userId', 'admin');
   ```
3. 刷新页面，导航栏就会出现"管理后台"入口
4. 在管理后台你可以审核用户的充值申请

## 数据持久化说明

当前版本使用本地文件存储数据，这在本地开发时可以正常工作。

但是在Vercel部署时，Vercel的文件系统是临时的，每次部署或函数冷启动都会重置数据。

如果你需要持久化数据，建议你：
1. 使用Vercel Postgres: https://vercel.com/storage/postgres
2. 或者使用Upstash Redis: https://upstash.com/
3. 修改 `lib/db.ts` 文件中的读写逻辑，将数据存储到数据库中

其他代码无需改动，只需要修改数据库层即可。

## 安全说明

- 所有API请求都通过后端代理，API Key不会泄露给前端
- 用户ID存储在本地存储，每个浏览器都是独立的用户
- 管理员接口有权限验证，只有管理员用户才能访问
- 所有输入都经过验证，防止恶意请求

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 即可查看应用。
