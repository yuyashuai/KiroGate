# KiroGate

OpenAI / Anthropic 兼容的 Kiro API 代理网关，通过任何支持 OpenAI 或 Anthropic API 的工具使用 Claude 模型。

## 主要功能

- **双 API 兼容** — 同时支持 OpenAI (`/v1/chat/completions`) 和 Anthropic (`/v1/messages`) 格式
- **多账号智能调度** — 账号池 + 健康评分 + 自动故障转移
- **双认证方式** — Kiro Desktop Token 和 AWS IdC (Identity Center) OIDC
- **流式传输** — SSE 流式响应，支持 Thinking 标签解析
- **工具调用** — Function Calling / Tool Use 支持
- **管理面板** — Web UI 管理账号、API Key、监控
- **零外部依赖** — Deno 原生运行，内置 KV 存储

## 部署

### 1. 安装 Deno

```bash
curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"
```

### 2. 启动服务

```bash
cd /path/to/KiroGate

export PROXY_API_KEY="your-api-key"       # 客户端调用密钥
export ADMIN_PASSWORD="your-admin-pwd"    # 管理面板密码

# 前台运行
deno run --allow-net --allow-env --unstable-kv main.ts

# 后台运行
nohup deno run --allow-net --allow-env --unstable-kv main.ts > /tmp/kirogate.log 2>&1 &
```

服务默认监听 `http://localhost:8000`，绑定 127.0.0.1，仅本地可访问。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PROXY_API_KEY` | `changeme_proxy_secret` | API 代理密钥 |
| `ADMIN_PASSWORD` | `admin` | 管理面板密码 |
| `PORT` | `8000` | 监听端口 |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `RATE_LIMIT_PER_MINUTE` | `0` | 全局限流（0=不限） |
| `ENABLE_COMPRESSION` | `true` | 上下文压缩 |

### Docker

```bash
docker build -t kirogate .
docker run -d -p 8000:8000 \
  -e PROXY_API_KEY="your-key" \
  -e ADMIN_PASSWORD="your-pwd" \
  kirogate
```

## 配置账号

KiroGate 需要 Kiro 的认证信息才能代理请求。支持两种认证方式。

### 获取 Token

从本地 Kiro 缓存中提取：

```bash
# Refresh Token + 认证信息
cat ~/.aws/sso/cache/kiro-auth-token.json

# OIDC 客户端凭证（IdC 方式需要）
# 文件名为 clientId 的 SHA1 哈希，可通过 kiro-auth-token.json 中的 clientIdHash 字段找到
cat ~/.aws/sso/cache/<clientIdHash>.json
```

### 方式 A：Web 管理面板

打开 `http://localhost:8000/admin/accounts`，输入管理密码后填写表单：

**Kiro Desktop 方式（默认）：**
- Refresh Token（必填）：从 `kiro-auth-token.json` 的 `refreshToken` 字段复制
- Region：`us-east-1`

**IdC (Identity Center) 方式：**
- 认证方式：选择 `IdC`
- Refresh Token（必填）：同上
- Client ID（必填）：从 OIDC 客户端凭证文件的 `clientId` 字段复制
- Client Secret（必填）：从 OIDC 客户端凭证文件的 `clientSecret` 字段复制
- Region：`us-east-1`

### 方式 B：命令行

```bash
curl -X POST http://localhost:8000/api/accounts \
  -H "Authorization: Bearer your-admin-pwd" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "从 kiro-auth-token.json 复制",
    "authMethod": "IdC",
    "clientId": "从 OIDC 客户端凭证文件复制",
    "clientSecret": "从 OIDC 客户端凭证文件复制",
    "region": "us-east-1"
  }'
```

> Kiro Desktop 方式不需要 `authMethod`、`clientId`、`clientSecret` 字段。

## 使用

### API 端点

| 格式 | Base URL | 端点 | 认证头 |
|------|----------|------|--------|
| OpenAI | `http://localhost:8000/v1` | `/v1/chat/completions` | `Authorization: Bearer KEY` |
| Anthropic | `http://localhost:8000` | `/v1/messages` | `x-api-key: KEY` |

### 快速测试

```bash
# 健康检查
curl http://localhost:8000/health

# OpenAI 格式
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hi"}],
    "stream": false
  }'

# Anthropic 格式
curl http://localhost:8000/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

### SDK 示例

**Python (OpenAI)：**
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="your-api-key")
response = client.chat.completions.create(
    model="claude-sonnet-4-5",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)
for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

**Python (Anthropic)：**
```python
import anthropic

client = anthropic.Anthropic(base_url="http://localhost:8000", api_key="your-api-key")
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)
```

### 支持的模型

`claude-opus-4-5` / `claude-sonnet-4-5` / `claude-sonnet-4` / `claude-haiku-4-5`

## 客户端集成示例

### OpenClaw

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "models": {
    "providers": {
      "kiro": {
        "baseUrl": "http://host.docker.internal:8000/v1",
        "apiKey": "your-api-key",
        "api": "openai-completions",
        "models": [{
          "id": "claude-sonnet-4-5",
          "name": "Claude Sonnet 4.5 (Kiro)",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 200000,
          "maxTokens": 64000
        }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "kiro/claude-sonnet-4-5" }
    }
  }
}
```

> Docker 容器访问宿主机用 `host.docker.internal`，本地直接用 `localhost`。

## 管理面板

| 路径 | 说明 |
|------|------|
| `/admin/accounts` | 账号管理 |
| `/admin/keys` | API Key 管理 |
| `/dashboard` | 监控面板 |
| `/playground` | 在线测试 |
| `/debug` | 调试面板 |

## 注意事项

- Token 会自动刷新，关闭 Kiro 本地应用不影响使用
- OIDC 客户端凭证有过期时间（通常几个月），过期后需重新登录 Kiro 获取
- 服务绑定 127.0.0.1，外网无法直接访问

## 致谢

基于 [kiro-openai-gateway](https://github.com/Jwadow/kiro-openai-gateway) 开发，整合 [kiro-account-manager](https://github.com/dext7r/kiro-account-manager) 功能。

## 许可证

[AGPL-3.0](LICENSE)
