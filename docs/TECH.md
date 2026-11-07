# 课堂评分投票系统 · 技术方案（TECH.md）

> 版本：V1.1 ｜ 日期：2026-11-07 ｜ 对应文档：[PRD.md](../PRD.md)
> 上游产物：`docs/html/` 目录下的 9 个静态页面（假数据原型），本文件定义接真后端时的整体方案。
> 功能点拆分清单另行产出（任务清单文档），本文件聚焦技术选型、接口、目录与数据表。

---

## 1. 技术栈与版本倾向

| 层 | 选型 | 版本倾向 | 说明 |
| --- | --- | --- | --- |
| 后端 | **FastAPI**（Python） | 3.10+ / FastAPI 0.1xx | 团队主栈为 Python 3.10，不升级主版本；FastAPI 自带 OpenAPI 文档，便于联调 |
| 数据库 | **SQLite**（开发/演示）→ 可平移 MySQL/PostgreSQL | SQLite3 内置 | 课堂演示零部署成本；表结构用标准 SQL 编写，后续切换只需换连接串 |
| ORM / SQL | **SQLAlchemy 2.x**（或直接 sqlite3 标准库） | 2.x | 数据量小、表少，若追求极简可用参数化 SQL；倾向 SQLAlchemy 以获得约束与迁移便利 |
| 数据校验 | **Pydantic v2** | 2.x | FastAPI 原生集成；schema 字段名与 API JSON（snake_case）严格对齐 |
| 鉴权 | **Session Cookie**（服务端签名会话） | — | 后台为传统多页应用，Cookie 会话最简单；登录态由 `SessionMiddleware` 或自签 token 承载 |
| 密码存储 | **hashlib**（标准库，PBKDF2-HMAC-SHA256 + 随机盐） | Python 内置，零依赖 | 只存哈希（`salt$hash` 十六进制），不存明文；初始账号由环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 在启动时初始化写入 |
| 前端 | **沿用现有 UI**：HTML + Tailwind CSS CDN + 原生 JS | Tailwind 3.x（CDN） | 保持 `docs/html/` 下 9 个页面的结构、样式与交互不变，仅把 localStorage 数据层替换为 fetch 调用 |
| 跨域 | **后端放开 CORS 限制**（`CORSMiddleware`，`allow_origins=["*"]` + `allow_credentials=True`） | — | 不引入 Nginx 反向代理，前后端不同端口/主机直接联调；生产如需收紧再改配置 |
| 启动方式 | **Uvicorn** 直跑 | uvicorn 0.3x | `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| 依赖管理 | **requirements.txt** | — | 不使用 pyproject.toml；`pip install -r requirements.txt` 即可复原环境 |

**鉴权要点**

- 登录成功后服务端种 `HttpOnly` 会话 Cookie；后台页面（题库/问卷/统计）的 API 全部要求有效会话，未登录返回 `401`，前端跳转 `login.html`。
- 前台投票接口（`vote.html` 使用）**不需要登录**，按 IP + 问卷去重。

---

## 2. 前后端交互方案

### 2.1 页面路由（静态页，由 FastAPI `StaticFiles` 托管）

页面文件与现有 `docs/html/` 目录一一对应，路径不变：

| 页面 | 路径 | 访问控制 |
| --- | --- | --- |
| 管理员登录 | `login.html` | 公开 |
| 题库列表 | `questions.html` | 需登录 |
| 题目新增 | `question-new.html` | 需登录 |
| 题目编辑 | `question-edit.html?id={questionId}` | 需登录 |
| 问卷列表 | `surveys.html` | 需登录 |
| 问卷新增 | `survey-new.html` | 需登录 |
| 问卷编辑 | `survey-edit.html?id={surveyId}` | 需登录 |
| 前台投票 | `vote.html?id={surveyId}` | 公开 |
| 问卷统计 | `stats.html?id={surveyId}` | 需登录 |

### 2.2 API 列表

统一前缀 `/api`，统一 JSON 响应。**API 字段命名统一使用 snake_case**（与数据库列名一致）。
现有 `docs/html/mock/*.json` 使用的是 camelCase（`scoreMin`/`questionIds` 等），前端接入时在 `assets/app.js` 的数据层做一次**字段映射**（snake_case ↔ camelCase），页面模板与渲染逻辑不动。

**鉴权**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应要点 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | 登录 | `{ "username": "admin", "password": "..." }` | `200`；Set-Cookie 会话；失败 `401 { "detail": "用户名或密码不正确" }` |
| POST | `/api/auth/logout` | 登出 | — | 清除 Cookie，`204` |
| GET | `/api/auth/me` | 当前登录态 | — | `{ "username": "admin" }` 或 `401` |

**题库（需登录）**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应要点 |
| --- | --- | --- | --- | --- |
| GET | `/api/questions` | 题目列表 | `?keyword=`（可选，标题/说明模糊） | `{ "questions": [Question] }`，按 `created_at` 倒序 |
| POST | `/api/questions` | 新增题目 | `{ title, description, score_min, score_max }` | `201` 返回完整 Question；校验：`title` 必填、`score_min < score_max`、均为整数 |
| GET | `/api/questions/{id}` | 题目详情 | — | 单个 Question；不存在 `404` |
| PUT | `/api/questions/{id}` | 编辑题目 | 同新增 | 返回更新后 Question |
| DELETE | `/api/questions/{id}` | 删除题目 | — | 被问卷引用时 `409 { "detail": "已被 N 份问卷引用" }`（与前端现有拦截一致） |

**问卷（需登录）**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应要点 |
| --- | --- | --- | --- | --- |
| GET | `/api/surveys` | 问卷列表 | — | `{ "surveys": [Survey] }`，每项附带 `vote_count`（提交人数，供列表页展示） |
| POST | `/api/surveys` | 新增问卷 | `{ title, description, question_ids: [...], is_open }` | `201`；校验：`question_ids` 非空且都存在 |
| GET | `/api/surveys/{id}` | 问卷详情 | — | 单个 Survey（含 `question_ids` 顺序） |
| PUT | `/api/surveys/{id}` | 编辑问卷 | 同新增（可单独只改 `is_open`） | 返回更新后 Survey |
| DELETE | `/api/surveys/{id}` | 删除问卷 | — | 级联删除该问卷答卷，`204` |
| GET | `/api/surveys/{id}/stats` | 问卷统计 | — | 见 2.4 |

**前台投票（公开，无需登录）**

| 方法 | 路径 | 说明 | 请求体 / 参数 | 响应要点 |
| --- | --- | --- | --- | --- |
| GET | `/api/public/surveys/{id}` | 投票页取卷 | — | 返回问卷 + 按序展开的题目数组；问卷关闭返回 `403`，不存在返回 `404` |
| POST | `/api/public/surveys/{id}/votes` | 提交答卷 | `{ voter_name, answers: [{ question_id, score }] }` | `201`；IP 取自 `X-Forwarded-For` 或 socket；重复提交 `409 { "detail": "同一 IP 已参与过本问卷" }`；分数越界 `422` |

### 2.3 登录态携带方式

- 后台 API：浏览器自动携带会话 Cookie（同源部署，无跨域问题）；`fetch` 统一封装在 `docs/html/assets/app.js`，遇 `401` 跳 `login.html`。
- 跨域场景（前后端不同端口联调）：后端 `CORSMiddleware` 放开限制（`allow_origins=["*"]`、`allow_credentials=True`），前端 fetch 加 `credentials: "include"`。
- 投票接口：不校验登录，仅校验 IP 去重。
- 若后续需要收紧，Cookie 方案改为 `Authorization: Bearer` 时只需改 `app.js` 里的一处请求头封装。

### 2.4 字段对齐约定（API 输出，snake_case）

```
Question: { id, title, description, score_min, score_max, created_at }
Survey:   { id, title, description, question_ids: string[], is_open, created_at }
Vote:     { id, survey_id, ip, voter_name, answers: [{ question_id, score }], submitted_at }
Stats:    { vote_count, questions: [{ question_id, title, score_min, score_max, average }], votes: [{ id, ip, voter_name, submitted_at }] }
```

- `id` 规则沿用 mock 前缀：`q_*` / `s_*` / `v_*`（后端可用 `q_` + 自增数字）。
- 时间字段统一 ISO 8601 带 `+08:00` 偏移，前端 `formatTime` 直接可解析。
- `Survey.question_ids` 的**数组顺序即题目展示顺序**，前后端都不得重排。
- 前端映射表（`app.js` 数据层一次转换）：`score_min↔scoreMin`、`score_max↔scoreMax`、`question_ids↔questionIds`、`is_open↔isOpen`、`created_at↔createdAt`、`voter_name↔voterName`、`submitted_at↔submittedAt`、`vote_count↔voteCount`。

---

## 3. 仓库目录结构

当前仓库实际结构（文档与前端原型统一收在 `docs/` 下），后端目录为规划新增：

```
ai_coding/
├── docs/
│   ├── PRD.md                # 产品需求文档
│   ├── TECH.md               # 本文档
│   ├── TASKS.md              # 功能点拆分清单（下一步产出）
│   ├── AGENTS.md / CLAUDE.md # 开发约定
│   └── html/                 # 现有静态前端原型（假数据版）
│       ├── index.html
│       ├── login.html / questions.html / question-*.html
│       ├── surveys.html / survey-*.html / vote.html / stats.html
│       ├── assets/app.js     # 数据层将从 localStorage 替换为 fetch("/api/...") + snake_case 映射
│       ├── mock/             # 演示数据：admin / questions / surveys / votes（camelCase 原样）
│       └── start.bat         # 本地静态演示一键启动
└── backend/                  # FastAPI 后端（规划新增）
    ├── app/
    │   ├── main.py           # FastAPI 入口、路由注册、CORS、静态页挂载
    │   ├── config.py         # 环境变量（ADMIN_USERNAME/ADMIN_PASSWORD、DB 路径、密钥）
    │   ├── database.py       # SQLAlchemy 引擎与建表
    │   ├── models.py         # ORM 模型（questions / surveys / votes / vote_answers）
    │   ├── schemas.py        # Pydantic 模型（snake_case，对齐 API JSON）
    │   ├── auth.py           # 登录 / 会话校验依赖 / hashlib 密码哈希
    │   └── routers/
    │       ├── auth.py       # /api/auth/*
    │       ├── questions.py  # /api/questions/*
    │       ├── surveys.py    # /api/surveys/*、stats
    │       └── public.py     # /api/public/*（投票）
    ├── data/                 # SQLite 文件（gitignore）
    ├── requirements.txt      # 唯一依赖清单（不用 pyproject.toml）
    └── tests/                # pytest 接口测试（登录、防重复提交等）
```

- 前端原型在 `docs/html/`，接后端时只改其中 `assets/app.js` 的数据层（localStorage → fetch + snake_case 映射），页面结构与渲染不动；`docs/html/start.bat` 仅供纯静态演示。
- 启动后端：`cd backend && pip install -r requirements.txt && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`。
- 部署（Docker 等）由团队自行处理，本文档不涉及。

---

## 4. 数据表设计（SQLite，5 张表 + 1 张索引说明）

> 约定：**不使用数据库层外键**（FOREIGN KEY），关联完整性由应用层保证；关联表使用**联合主键**，查询列按需建索引。

```sql
-- 管理员（初始账号由环境变量写入；密码存 hashlib PBKDF2 哈希）
CREATE TABLE admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,              -- 'salt$hash'（PBKDF2-HMAC-SHA256，标准库 hashlib）
    created_at    TEXT    NOT NULL               -- ISO 8601 +08:00
);

-- 评分题
CREATE TABLE questions (
    id          TEXT    PRIMARY KEY,              -- 'q_1001'
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    score_min   INTEGER NOT NULL,
    score_max   INTEGER NOT NULL,
    created_at  TEXT    NOT NULL,
    CHECK (score_min < score_max)
);

-- 问卷
CREATE TABLE surveys (
    id          TEXT    PRIMARY KEY,              -- 's_2001'
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    is_open     INTEGER NOT NULL DEFAULT 0,       -- 0 关闭 / 1 开放
    created_at  TEXT    NOT NULL
);

-- 问卷-题目关联（联合主键；无外键；sort_order 即前端展示顺序）
CREATE TABLE survey_questions (
    survey_id   TEXT    NOT NULL,
    question_id TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL,
    PRIMARY KEY (survey_id, question_id)          -- 联合主键：同一问卷同一题只出现一次
);
CREATE INDEX idx_survey_questions_question ON survey_questions(question_id);  -- 反查“题目被哪些问卷引用”

-- 答卷（联合唯一约束实现“同一问卷同一 IP 只能提交一次”；无外键）
CREATE TABLE votes (
    id           TEXT PRIMARY KEY,                -- 'v_3001'
    survey_id    TEXT NOT NULL,
    ip           TEXT NOT NULL,
    voter_name   TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    UNIQUE (survey_id, ip)                        -- ★ 防刷分核心约束
);
CREATE INDEX idx_votes_survey ON votes(survey_id);

-- 答卷明细（每题一行，便于按题统计均分；联合主键；无外键）
CREATE TABLE vote_answers (
    vote_id     TEXT NOT NULL,
    question_id TEXT NOT NULL,
    score       INTEGER NOT NULL,
    PRIMARY KEY (vote_id, question_id)            -- 联合主键：一份答卷一题只打一次分
);
CREATE INDEX idx_vote_answers_question ON vote_answers(question_id);
```

**约束与校验对应关系**

| PRD 要求 | 落地方式 |
| --- | --- |
| 同一 IP 同一问卷只能提交一次 | `votes` 表 `UNIQUE(survey_id, ip)`；插入冲突返回 `409`，应用层先查再插给出友好提示 |
| 题目分值范围 1~10 可配置 | `questions.score_min / score_max`；提交时校验 `score_min <= score <= score_max`，越界 `422` |
| 问卷题目顺序 | `survey_questions.sort_order`，读取时按其排序还原 `question_ids` 数组 |
| 删除被引用的题目需拦截 | 应用层查 `survey_questions`（按 `question_id` 索引）引用计数，命中返回 `409`（与前端现有行为一致） |
| 关闭问卷不可提交 | `surveys.is_open = 0` 时投票接口返回 `403` |
| 关联完整性（无外键） | 删除问卷时应用层在同一事务内删除 `survey_questions`、`votes`、`vote_answers` 对应行；删除题目前先校验引用 |
| 密码不明文入库 | `admins.password_hash` 存 hashlib PBKDF2 哈希（带随机盐）；初始账号来自环境变量 |

**统计查询示例**（对应 `/api/surveys/{id}/stats`）：

```sql
SELECT va.question_id,
       COUNT(*)                AS valid_count,
       ROUND(AVG(va.score), 2) AS average
FROM vote_answers va
JOIN votes v ON v.id = va.vote_id
WHERE v.survey_id = :survey_id
GROUP BY va.question_id;
```
