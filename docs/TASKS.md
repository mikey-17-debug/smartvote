# 课堂评分投票系统 · 功能点拆分清单（TASKS.md）

> 版本：V1.0 ｜ 日期：2026-11-07 ｜ 上游文档：[PRD.md](PRD.md) · [TECH.md](TECH.md)
> 每条功能点统一包含五个字段：**短名**（kebab-case，用于分支名/提交信息/跟踪）、**范围**（只做什么）、**对应页面/假数据**（接真后端时替换哪一块）、**验收方式**（怎样算通过）、**依赖**（必须先完成哪一条）。

---

## T0 · 工程初始化

### T0.1 `init-backend-skeleton`
- **范围**：按 TECH.md 第 3 节创建 `backend/` 目录骨架（`app/`、`app/routers/`、`data/`、`tests/`），`data/` 加入 `.gitignore`。只建目录和空模块文件。
- **对应页面/假数据**：无，纯后端。
- **验收方式**：目录树与 TECH.md 一致；`git status` 不跟踪 `data/`。
- **依赖**：无。

### T0.2 `write-requirements`
- **范围**：编写 `backend/requirements.txt`（fastapi、uvicorn、sqlalchemy、pydantic v2、pytest、httpx）。不创建 pyproject.toml。
- **对应页面/假数据**：无。
- **验收方式**：新建虚拟环境执行 `pip install -r requirements.txt` 成功，`uvicorn --version` 可执行。
- **依赖**：T0.1。

### T0.3 `env-config`
- **范围**：`app/config.py` 读取 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`SESSION_SECRET`、`DB_PATH`，只从环境变量取值，缺失时给出清晰报错。
- **对应页面/假数据**：对应 `docs/html/mock/admin.json`——接真后该文件仅保留给纯静态演示，后端不再读取。
- **验收方式**：不设变量启动时报错提示；设齐变量后 `config` 各字段值正确；代码与仓库中无明文密钥。
- **依赖**：T0.1。

### T0.4 `fastapi-app-entry`
- **范围**：`app/main.py` 创建 FastAPI 实例、注册 CORS（`allow_origins=["*"]` + `allow_credentials=True`）、挂载 `docs/html/` 静态页、注册启动事件（初始化数据库与管理员）。不含任何业务路由。
- **对应页面/假数据**：挂载点即 `docs/html/` 全部 9 个页面；接真后访问 `http://host:8000/login.html` 由后端直接返回。
- **验收方式**：`python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` 启动成功；浏览器打开 `/login.html` 返回页面；`/docs` 可见（暂无业务接口）。
- **依赖**：T0.2、T0.3。

## T1 · 认证模块

### T1.1 `password-hashlib`
- **范围**：`app/auth.py` 实现标准库 hashlib 的 PBKDF2-HMAC-SHA256 加盐哈希：`hash_password()`、`verify_password()`，存储格式 `salt$hash`。不做其他事。
- **对应页面/假数据**：替换 `docs/html/mock/admin.json` 中的 `passwordSha256` 校验逻辑。
- **验收方式**：单测——同一密码两次 `hash_password` 结果不同（盐生效）；`verify_password` 对正确密码 True、错误密码 False。
- **依赖**：T0.1。

### T1.2 `seed-admin`
- **范围**：应用启动时若 `admins` 表为空，用环境变量创建初始管理员；表非空则跳过。只做插入，不做登录。
- **对应页面/假数据**：替换 `mock/admin.json` 的 `username` 字段来源。
- **验收方式**：首次启动表里有且仅有一条管理员；重启二次不新增；用户名密码与环境变量一致。
- **依赖**：T1.1、T2.1、T0.3。

### T1.3 `login-api`
- **范围**：`POST /api/auth/login`——校验用户名密码，成功种 HttpOnly 会话 Cookie；失败返回 `401`。只处理登录，不做登出。
- **对应页面/假数据**：`docs/html/login.html` 的提交处理——由本地校验 `mock/admin.json` 改为调本接口。
- **验收方式**：pytest——正确凭据 `200` 且响应含 Set-Cookie；错误密码 `401` 且 `detail` 文案正确。
- **依赖**：T1.1、T1.2。

### T1.4 `logout-api`
- **范围**：`POST /api/auth/logout`——清除会话 Cookie，返回 `204`。只做登出。
- **对应页面/假数据**：`docs/html/assets/app.js` 侧边栏「退出登录」`logout()`——由 sessionStorage 清除改为调本接口。
- **验收方式**：登录后调用登出，再访问受保护接口返回 `401`。
- **依赖**：T1.3。

### T1.5 `require-admin-dep`
- **范围**：FastAPI 依赖 `require_admin`，供所有后台接口 Depends 使用；无有效会话返回 `401`。只做校验，不含业务。
- **对应页面/假数据**：对应 `app.js` 中 `mountAdmin()` 的 `isLoggedIn()` 前端拦截——接真后由后端 401 + 前端跳转共同保证。
- **验收方式**：pytest——带有效 Cookie 访问打桩接口 `200`，不带 `401`。
- **依赖**：T1.3。

### T1.6 `me-api`
- **范围**：`GET /api/auth/me`——返回 `{ "username": ... }` 或 `401`。只读当前登录态。
- **对应页面/假数据**：`app.js` `isLoggedIn()`——由 sessionStorage 判断改为调本接口。
- **验收方式**：登录后返回用户名；登出后返回 `401`。
- **依赖**：T1.3。

## T2 · 数据库模型

### T2.1 `db-engine-create`
- **范围**：`app/database.py` + `app/models.py`——SQLAlchemy 2.x 引擎（路径取 `DB_PATH`）、Session 管理、启动建表。只建 `questions`、`surveys` 两张主表。
- **对应页面/假数据**：替换 `mock/questions.json`、`mock/surveys.json` 的存储介质。
- **验收方式**：首次启动生成 `data/*.db`，两张表列名/类型与 TECH.md 一致。
- **依赖**：T0.1、T0.3。

### T2.2 `tables-question-survey`
- **范围**：补齐 `questions`（CHECK score_min < score_max）与 `surveys`（is_open 默认 0）的字段约束。只写约束。
- **对应页面/假数据**：字段来源对应 `mock/questions.json` 的 `scoreMin/scoreMax`、`mock/surveys.json` 的 `isOpen`。
- **验收方式**：pytest——插入 `score_min >= score_max` 的题目抛 IntegrityError。
- **依赖**：T2.1。

### T2.3 `table-survey-questions`
- **范围**：建 `survey_questions` 关联表：联合主键 `(survey_id, question_id)`、`sort_order`、`question_id` 普通索引；**不建外键**。
- **对应页面/假数据**：替换 `mock/surveys.json` 的 `questionIds` 数组（数组顺序 → `sort_order`）。
- **验收方式**：pytest——同问卷同题插入两次报主键冲突；`question_id` 上有索引（EXPLAIN 验证）。
- **依赖**：T2.1。

### T2.4 `table-votes`
- **范围**：建 `votes` 表：`UNIQUE(survey_id, ip)`、`survey_id` 普通索引；无外键。
- **对应页面/假数据**：替换 `mock/votes.json` 的 `surveyId/ip/voterName/submittedAt` 顶层字段。
- **验收方式**：pytest——同问卷同 IP 插入两次报唯一约束冲突；不同 IP 正常。
- **依赖**：T2.1。

### T2.5 `table-vote-answers`
- **范围**：建 `vote_answers` 表：联合主键 `(vote_id, question_id)`、`question_id` 索引；无外键。
- **对应页面/假数据**：替换 `mock/votes.json` 每条记录的 `answers[{questionId, score}]`。
- **验收方式**：pytest——同答卷同题两行报主键冲突。
- **依赖**：T2.1。

### T2.6 `cascade-delete-app-layer`
- **范围**：应用层封装「删除问卷」数据操作——同一事务内删除 `survey_questions`、`votes`、`vote_answers` 对应行。只封装数据操作，不含路由。
- **对应页面/假数据**：对应 `mock/votes.json` 中该问卷全部答卷的清理。
- **验收方式**：pytest——造问卷+2 答卷，执行删除后四张表中该问卷数据全为空。
- **依赖**：T2.3、T2.4、T2.5。

## T3 · 题库模块

### T3.1 `question-list-api`
- **范围**：`GET /api/questions`——需登录；支持 `?keyword=` 对标题/说明模糊匹配；按 `created_at` 倒序。只做查询。
- **对应页面/假数据**：`docs/html/questions.html` 列表渲染 + 搜索框——`loadDB().questions` 改为调本接口。
- **验收方式**：pytest——返回结构与 TECH.md 的 `Question` 一致（snake_case）；keyword 过滤与排序正确；未登录 `401`。
- **依赖**：T2.1、T1.5。

### T3.2 `question-create-api`
- **范围**：`POST /api/questions`——校验 title 必填、score_min/score_max 为整数且 min < max；生成 `q_` 前缀自增 id。只做新增。
- **对应页面/假数据**：`docs/html/question-new.html` 提交逻辑——本地 push 到 localStorage 改为调本接口。
- **验收方式**：pytest——合法 `201` 返回完整对象；缺标题/范围倒置 `422`。
- **依赖**：T2.2、T1.5。

### T3.3 `question-detail-api`
- **范围**：`GET /api/questions/{id}`——单个查询，不存在 `404`。
- **对应页面/假数据**：`docs/html/question-edit.html` 回显逻辑——按 URL `?id=` 从接口取数替代本地查找。
- **验收方式**：pytest——存在返回对象，不存在 `404`。
- **依赖**：T2.1、T1.5。

### T3.4 `question-update-api`
- **范围**：`PUT /api/questions/{id}`——同 T3.2 校验，更新并返回新对象。只做更新。
- **对应页面/假数据**：`question-edit.html` 保存逻辑——本地改写 localStorage 改为调本接口。
- **验收方式**：pytest——更新后 `GET` 结果一致；非法分值 `422`；不存在 `404`。
- **依赖**：T3.3。

### T3.5 `question-delete-api`
- **范围**：`DELETE /api/questions/{id}`——先按 `question_id` 查 `survey_questions` 引用计数：被引用返回 `409`（detail 含份数），未引用则删除。只做删除。
- **对应页面/假数据**：`questions.html` 删除按钮——前端「被 N 份问卷引用」的本地拦截改为直接展示后端 `409` detail。
- **验收方式**：pytest——被引用删除 `409`，未引用删除 `204` 后列表不再出现。
- **依赖**：T3.3、T2.3。

## T4 · 问卷模块

### T4.1 `survey-list-api`
- **范围**：`GET /api/surveys`——需登录；每项附带 `vote_count`（该问卷答卷数）。只做查询。
- **对应页面/假数据**：`docs/html/surveys.html` 列表（含「N 人已提交」）——`surveyVotes(db, id).length` 改为读 `vote_count`。
- **验收方式**：pytest——`vote_count` 与 `votes` 表计数一致；未登录 `401`。
- **依赖**：T2.1、T1.5。

### T4.2 `survey-create-api`
- **范围**：`POST /api/surveys`——校验 `question_ids` 非空且题目全部存在；按数组顺序写 `sort_order`；生成 `s_` 前缀 id；`is_open` 可选默认 true。只做新增。
- **对应页面/假数据**：`docs/html/survey-new.html` 提交逻辑——本地组卷存 localStorage 改为调本接口。
- **验收方式**：pytest——`GET` 详情还原的 `question_ids` 顺序与提交一致；空数组/含不存在题目 `422`。
- **依赖**：T2.2、T2.3、T1.5。

### T4.3 `survey-detail-api`
- **范围**：`GET /api/surveys/{id}`——按 `sort_order` 还原 `question_ids` 数组返回。
- **对应页面/假数据**：`survey-new.html`/`survey-edit.html` 的回显——本地查 `surveys.find` 改为调本接口。
- **验收方式**：pytest——顺序与创建时一致；不存在 `404`。
- **依赖**：T4.2。

### T4.4 `survey-update-api`
- **范围**：`PUT /api/surveys/{id}`——可改标题/说明/题目组成与顺序（重建 `survey_questions`），可单独只改 `is_open`。只做更新。
- **对应页面/假数据**：`docs/html/survey-edit.html` 的保存与「开放/关闭投票」按钮——两处都改调本接口。
- **验收方式**：pytest——只传 `is_open` 时题目不变；改题目组成后顺序正确；关闭后 `GET` 的 `is_open=false`。
- **依赖**：T4.3、T2.6。

### T4.5 `survey-delete-api`
- **范围**：`DELETE /api/surveys/{id}`——调用 T2.6 的应用层级联删除，返回 `204`。只做删除。
- **对应页面/假数据**：`survey-edit.html` 「删除问卷」按钮——本地删 surveys+votes 改为调本接口。
- **验收方式**：pytest——删除后列表 `404`/不出现，关联答卷为空。
- **依赖**：T2.6。

## T5 · 前台投票模块（公开，无需登录）

### T5.1 `public-survey-get`
- **范围**：`GET /api/public/surveys/{id}`——返回问卷信息 + 按 `sort_order` 展开的题目数组；`is_open=0` 返回 `403`，不存在返回 `404`。只做读取。
- **对应页面/假数据**：`docs/html/vote.html` 的取卷逻辑——`db.surveys.find` + 三种状态页改为调本接口。
- **验收方式**：pytest——正常返回含题数组；关闭 `403`；不存在 `404`。
- **依赖**：T2.3、T4.3。

### T5.2 `public-vote-submit`
- **范围**：`POST /api/public/surveys/{id}/votes`——IP 取 `X-Forwarded-For` 或 socket；校验答案覆盖问卷全部题目且每题分数在 `[score_min, score_max]`（越界 `422`）；生成 `v_` 前缀 id；写 `votes` + `vote_answers`。只做提交。
- **对应页面/假数据**：`vote.html` 提交逻辑——本地 push `db.votes` 改为调本接口。
- **验收方式**：pytest——合法 `201`；缺题/越界 `422`；数据库落库字段与提交一致。
- **依赖**：T2.4、T2.5、T5.1。

### T5.3 `vote-duplicate-guard`
- **范围**：在 T5.2 流程中加防重复——先查 `votes` 是否已有 `(survey_id, ip)`，命中返回 `409 { "detail": "同一 IP 已参与过本问卷" }`。只做拦截。
- **对应页面/假数据**：`vote.html` 的「已提交过」状态页——本地 `db.votes.some(...)` 改为依赖 `409` 响应。
- **验收方式**：pytest——同 IP 二次提交 `409` 且 detail 正确；不同 IP 正常 `201`。
- **依赖**：T5.2。

### T5.4 `voter-name-optional`
- **范围**：T5.2 中 `voter_name` 允许缺省/空串，落库为 `''`。只做字段默认值处理。
- **对应页面/假数据**：`mock/votes.json` 中 `voterName: ""` 的那条（v_3004）即该场景样例。
- **验收方式**：pytest——不传 `voter_name` 提交 `201`，库中为空串；统计答卷列表姓名列可显示 `-`。
- **依赖**：T5.2。

## T6 · 统计模块

### T6.1 `survey-stats-api`
- **范围**：`GET /api/surveys/{id}/stats`——需登录；返回 `vote_count`、各题 `{ question_id, title, score_min, score_max, average }`（GROUP BY + AVG，保留 2 位）、答卷列表 `{ id, ip, voter_name, submitted_at }` 按时间倒序。只做聚合查询。
- **对应页面/假数据**：`docs/html/stats.html` 全部数据源——本地 `surveyVotes` + `average()` 计算改为调本接口。
- **验收方式**：pytest——构造 5 条答卷（对齐 `mock/votes.json` 数据）核对人数与各题均分逐位一致；未登录 `401`。
- **依赖**：T2.4、T2.5、T1.5。

### T6.2 `stats-empty-case`
- **范围**：T6.1 对空问卷的口径——无答卷时 `vote_count=0`、各题 `average=null`。只做边界处理。
- **对应页面/假数据**：`mock/surveys.json` 的 `s_2002`（已关闭且无答卷）即该场景样例。
- **验收方式**：pytest——空问卷返回 `vote_count=0`、`average=null`；前端统计页显示 `-` 不报错。
- **依赖**：T6.1。

## T7 · 前端接入（`docs/html/assets/app.js`）

### T7.1 `fe-fetch-layer`
- **范围**：重写 `app.js` 数据层——删除 `loadDB/saveDB`（localStorage），新增统一 `apiFetch`：自动带 `credentials: "include"`、`401` 跳 `login.html`、非 2xx 统一抛错供页面提示。只改数据层，不动页面模板。
- **对应页面/假数据**：全部 9 个页面的共同依赖；`mock/` 目录保留供纯静态演示。
- **验收方式**：`mock/` 路径在 app.js 中不再被引用；断网/500 时页面出现统一错误提示而非静默失败。
- **依赖**：T0.4。

### T7.2 `fe-field-mapping`
- **范围**：在 `apiFetch` 响应出口做 snake_case → camelCase 一次映射（TECH.md 2.4 表：`score_min→scoreMin` 等），请求入口做反向映射。只做字段转换。
- **对应页面/假数据**：保证 9 个页面模板继续读 `scoreMin/questionIds/isOpen` 等 camelCase 字段，渲染逻辑零改动。
- **验收方式**：任一页面渲染出的字段与接 mock 时完全一致；接口返回 snake_case 不再报 undefined。
- **依赖**：T7.1。

### T7.3 `fe-login-page`
- **范围**：`login.html` 提交改调 `POST /api/auth/login`；成功跳 `questions.html`；失败展示后端 `detail` 文案。只改登录页。
- **对应页面/假数据**：替换其本地 `verifyAdmin()`（读 `mock/admin.json` + SHA-256 比对）整块。
- **验收方式**：环境变量账号可登录跳转；错误密码显示后端提示。
- **依赖**：T1.3、T7.1。

### T7.4 `fe-question-pages`
- **范围**：`questions.html` / `question-new.html` / `question-edit.html` 对接 T3 五个接口；删除时 `409` 直接展示后端 detail。只改题库三页。
- **对应页面/假数据**：替换三页中所有 `db.questions` 的读写。
- **验收方式**：浏览器走通：搜索 → 新增 → 编辑 → 删除被引用（409 提示）→ 删除未引用。
- **依赖**：T3.1–T3.5、T7.2。

### T7.5 `fe-survey-pages`
- **范围**：`surveys.html` / `survey-new.html` / `survey-edit.html` 对接 T4 接口；列表读 `vote_count`，编辑页开关调 `PUT`，问卷地址复制改为 `vote.html?id=` 真实地址。只改问卷三页。
- **对应页面/假数据**：替换三页中所有 `db.surveys` 读写与本地 `isOpen` 切换。
- **验收方式**：浏览器走通：组卷（含排序）→ 列表显示人数 → 关闭/开放 → 复制地址打开前台。
- **依赖**：T4.1–T4.5、T7.2。

### T7.6 `fe-vote-page`
- **范围**：`vote.html` 对接 T5：取卷渲染、提交打分；按 `403/404/409` 分别渲染「已关闭/不存在/已提交过」页面。只改投票页。
- **对应页面/假数据**：替换其本地 `db` 读写与重复提交判断（含 `mockClientIp()`，改为后端按真实 IP 判定）。
- **验收方式**：浏览器走通：正常提交显示成功页；同 IP 再开显示「已提交过」；关闭问卷显示可读提示。
- **依赖**：T5.1–T5.4、T7.2。

### T7.7 `fe-stats-page`
- **范围**：`stats.html` 对接 `GET /api/surveys/{id}/stats`；渲染人数、各题均分（`average` 为 null 显示 `-`）、答卷列表。只改统计页。
- **对应页面/假数据**：替换其本地 `surveyVotes`/`average()` 计算。
- **验收方式**：统计页数值与 pytest 核对过的接口返回一致；空问卷不报错。
- **依赖**：T6.1、T6.2、T7.2。

## T8 · 测试与验收

### T8.1 `pytest-suite`
- **范围**：`backend/tests/` 用 httpx 编写接口测试，覆盖：登录成功/失败、题库 CRUD 与 409、组卷校验、投票防重复、分数越界 422、统计口径（含空问卷）。只写测试。
- **对应页面/假数据**：以 `docs/html/mock/*.json` 的数据形态为基准构造用例。
- **验收方式**：`cd backend && pytest` 全绿；无 skip/xfail。
- **依赖**：T1–T6 全部。

### T8.2 `lan-demo-acceptance`
- **范围**：按 PRD 成功标准做端到端演示——`--host 0.0.0.0` 启动，局域网设备走完登录 → 建题 → 组卷 → 投票 → 防重复 → 看统计。只做验收，不修功能（发现问题回对应任务）。
- **对应页面/假数据**：全程使用 `docs/html/` 真实页面，不再依赖 mock。
- **验收方式**：两台不同 IP 设备各投一票，统计人数=2；同 IP 第二次提交被拒且提示明确；全程无控制台报错。
- **依赖**：T7 全部、T8.1。

---

### 建议实施顺序

T0 → T2 → T1 → T3 → T4 → T5 → T6 → T7 → T8
（先库后接口、先鉴权后业务；T7 前端接入依赖 T1–T6 全部就绪，T8 收尾验收。）
