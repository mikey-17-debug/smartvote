-- 课堂评分投票系统 · 初始化表结构（MySQL 8.0）
-- 与 docs/TECH.md 第 4 节一致，仅把 SQLite 类型换成 MySQL 类型。
-- 本文件只在数据目录为空、容器首次初始化时执行一次；
-- 之后改了表结构需要 docker compose down 并删除 ./volumes/mysql/data 再启动。

SET NAMES utf8mb4;

-- 管理员（初始账号由环境变量写入；密码存 PBKDF2 哈希）
CREATE TABLE IF NOT EXISTS admins (
    id            INT           NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)   NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,                -- 'salt$hash'
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评分题
CREATE TABLE IF NOT EXISTS questions (
    id          VARCHAR(32)   NOT NULL,                  -- 'q_1001'
    title       VARCHAR(120)  NOT NULL,
    description VARCHAR(500)  NOT NULL DEFAULT '',
    score_min   INT           NOT NULL,
    score_max   INT           NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_questions_score CHECK (score_min < score_max)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 问卷
CREATE TABLE IF NOT EXISTS surveys (
    id          VARCHAR(32)   NOT NULL,                  -- 's_2001'
    title       VARCHAR(120)  NOT NULL,
    description VARCHAR(500)  NOT NULL DEFAULT '',
    is_open     TINYINT       NOT NULL DEFAULT 0,        -- 0 关闭 / 1 开放
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 问卷-题目关联（联合主键；sort_order 即前端展示顺序）
CREATE TABLE IF NOT EXISTS survey_questions (
    survey_id   VARCHAR(32)   NOT NULL,
    question_id VARCHAR(32)   NOT NULL,
    sort_order  INT           NOT NULL,
    PRIMARY KEY (survey_id, question_id),
    KEY idx_survey_questions_question (question_id)       -- 反查「题目被哪些问卷引用」
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 答卷（UNIQUE(survey_id, ip) 是防刷分的核心约束）
CREATE TABLE IF NOT EXISTS votes (
    id           VARCHAR(32)  NOT NULL,                  -- 'v_3001'
    survey_id    VARCHAR(32)  NOT NULL,
    ip           VARCHAR(45)  NOT NULL,                  -- 兼容 IPv6
    voter_name   VARCHAR(64)  NOT NULL DEFAULT '',
    submitted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_votes_survey_ip (survey_id, ip),
    KEY idx_votes_survey (survey_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 答卷明细（每题一行，便于按题统计均分）
CREATE TABLE IF NOT EXISTS vote_answers (
    vote_id     VARCHAR(32)  NOT NULL,
    question_id VARCHAR(32)  NOT NULL,
    score       INT          NOT NULL,
    PRIMARY KEY (vote_id, question_id),
    KEY idx_vote_answers_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
