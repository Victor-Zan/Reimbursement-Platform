# AI-上手：社联报销平台

> **用途**：给 AI 读的项目上手手册。动手改这个仓库的代码之前先读完本文。
> **定位方式**：全文用 `路径::符号名` 定位（`路径` 相对仓库根），**不用行号**——行号在第一次编辑后即失效。符号名可直接 grep 到。
> **状态标记**：无标记 = 代码里直接读到；**【推断】** = 推出来的，紧跟推断依据；**【未确认】** = 本次没查清，集中列在第 11 节。
> **覆盖范围**：`backend/` 全部 `.py`、`frontend/src/` 全部页面与配置、根目录 `.md` 与配置文件。未读 `frontend/node_modules/`、`.git/`、`Logo源文件/`、二进制模板（`空白报销表.xls`、`template.xlsx` 仅按代码引用确认存在，未打开）。详见第 12 节。
> **git 使用情况**：**本次未使用 git 历史**（`git log` / `git blame` 等一律未执行）。仓库根存在 `.git/` 目录，但本次分析不依赖它。
> **生成时间**：2026-09-25

**最硬的 3 条约束（先记这三条）**

1. **不要引入 ORM、不要引入迁移工具（Alembic 等）**。SQL 全部手写在 `backend/database.py::get_connection()` 返回的连接上；建表/改表统一改 `backend/database.py::init_db()`。
2. **报销类型与材料清单以后端 `backend/reimbursement_types.py` 为唯一事实源**，`frontend/src/config/materials.ts` 是它的前端镜像。改一端必须同步改另一端。
3. **新增接口一律写在 `backend/main.py`**，业务逻辑写进 `backend/xxx_service.py`；**不要拆 router 文件**。

---

## 1. 一句话与技术栈

**一句话**：香港中文大学（深圳）学生社团联合会的学生活动经费报销平台——报销人上传发票与材料 → OCR 识别 → 填报销表 → 规则校验 → 打包成 ZIP（Excel 报销表 + 材料）提交 → 审核员审核 → 管理员处理申诉与权限申请。

| 层 | 事实 | 依据 |
|---|---|---|
| 后端框架 | FastAPI `0.115.0`，ASGI 服务器 uvicorn `0.30.6`；启动方式 `python main.py`（`__main__` 分支内 `uvicorn.run`） | `backend/requirements.txt`、`backend/main.py::app`、`backend/config.py::HOST` / `backend/config.py::PORT` |
| 数据访问 | psycopg2 `2.9.12` 直连 PostgreSQL，**手写 SQL，无 ORM** | `backend/requirements.txt`、`backend/database.py::get_connection` |
| 数据库 | 表：`drafts` / `users` / `submissions` / `review_annotations` / `reviewer_applications` / `appeals` | `backend/database.py::init_db` |
| OCR | 三套引擎：百度 OCR（带限流器）、本地 pdfplumber、mock；由配置项切换 | `backend/ocr.py::BaiduOCREngine` / `backend/ocr.py::PDFInvoiceEngine` / `backend/ocr.py::MockOCREngine` / `backend/ocr.py::get_ocr_engine` |
| Excel | openpyxl `3.1.5`，基于模板写入 | `backend/excel_generator.py::generate_reimbursement_excel` |
| PDF | pdfplumber `0.11.10` + pypdf `6.0.0`（前者抽取，后者解密） | `backend/requirements.txt`、`backend/main.py::_strip_pdf_encryption` |
| 鉴权 | PyJWT `2.13.0` 签 HS256 token + bcrypt `5.0.0` 哈希密码 | `backend/auth.py::create_token` / `backend/auth.py::hash_password` |
| 图片 | Pillow `12.3.0`（发票叠加文字） | `backend/invoice_annotator.py::annotate_invoice` |
| 前端框架 | React `18.3.1` + TypeScript `5.6` + Vite `6` | `frontend/package.json` |
| 前端路由 | react-router-dom `7.18.2` | `frontend/package.json`、`frontend/src/App.tsx::App` |
| 前端样式 | 无 UI 框架、无 CSS Modules；全部类写在单一 `frontend/src/index.css`，页面用字符串 `className` 引用 | `frontend/src/index.css`（`.btn` / `.badge` / `.page-head` / `.submission-list` / `.modal` 等类均在此定义） |
| 前端请求 | 无 API 客户端封装层；每个页面直接 `fetch('/api/v1/...')` | `frontend/src/pages/AdminPermissions.tsx` 等 |

---

## 2. 目录职责

按目录（后端为扁平目录，故按文件职责分组）。**核心**列 = 改动高频或牵一发动全身。

| 路径 | 职责 | 核心 | 依据 |
|---|---|---|---|
| `backend/main.py` | **唯一的 FastAPI 入口**：35 个路由、CORS 白名单、上传文件静态服务、启动钩子调 `init_db()`；`submit_package` 主流程也在这里 | 是 | 文件本身 |
| `backend/config.py` | 自定义 `.env` 加载器（`os.environ.setdefault`）+ 全部常量：路径、发票抬头期望值、DB 连接、OCR 引擎选择 | 是 | 文件本身 |
| `backend/database.py` | `get_connection()` 与 `init_db()`（幂等建表 + 历史迁移 + 回填） | 是 | 文件本身 |
| `backend/draft_service.py` | 草稿 CRUD（按 `user_email` 隔离） | 否 | `backend/draft_service.py::save_draft` |
| `backend/user_service.py` | 注册/登录/角色授权（`is_reviewer` / `is_admin`）、按邮箱域名定角色 | 是 | `backend/user_service.py::register` / `backend/user_service.py::login` |
| `backend/review_service.py` | 审核状态流转、批注、报销进度（`报销流程中`/`已报销`）、申诉结案 | 是 | `backend/review_service.py::approve_submission` / `backend/review_service.py::reject_submission` / `backend/review_service.py::update_reimburse_progress` / `backend/review_service.py::resolve_appeal` |
| `backend/application_service.py` | 审核员/管理员权限申请的提交、列表、批准 | 否 | `backend/application_service.py::submit_application` / `backend/application_service.py::approve_application` |
| `backend/appeal_service.py` | 申诉（打回未到账 / 材料被打回两类）创建与列表 | 否 | `backend/appeal_service.py::create_appeals` / `backend/appeal_service.py::list_all_appeals` |
| `backend/reimbursement_types.py` | **报销类型与材料清单的后端事实源**（类型列表、材料数量上下限、类型对材料的覆盖、类型标签） | 是 | 文件 docstring + `backend/reimbursement_types.py::TYPE_MATERIALS` |
| `backend/validation_rules.py` | 7 条报销表校验规则 + 表单数据类 | 是 | `backend/validation_rules.py::RULES` |
| `backend/validator.py` | 请求 JSON → 表单数据类，跑规则，汇总 `ValidationResult` | 是 | `backend/validator.py::validate_form` / `backend/validator.py::build_form_data` |
| `backend/ocr.py` | OCR 引擎抽象与实现、百度接口限流 | 是 | `backend/ocr.py::BaseOCREngine` / `backend/ocr.py::BaiduRateLimiter` |
| `backend/ocr_field_mapping.py` | OCR 结果与报销表字段的 **dataclass 定义**（`InvoiceItem` / `OCRResult` / `InvoiceSection`） | 否 | 文件本身 |
| `backend/excel_generator.py` | 把表单数据写进 Excel 模板，并产出 HTML 预览 | 是 | `backend/excel_generator.py::generate_reimbursement_excel` / `backend/excel_generator.py::workbook_to_html` |
| `backend/packager.py` | 把 Excel 与各类型材料打成提交用 ZIP | 是 | `backend/packager.py::create_submission_package` |
| `backend/invoice_annotator.py` | 在发票图片/PDF 上叠加打印社团名、活动名、经手人、金额 | 否 | `backend/invoice_annotator.py::annotate_invoice` |
| `backend/auth.py` | 密码哈希、JWT 签发与解析 | 是 | `backend/auth.py::decode_token` / `backend/auth.py::verify_password` |
| `backend/_test_multi_type.py` | 自述"临时测试…跑完即删"的多类型端到端脚本，**不是测试套件** | 否 | 文件 docstring |
| `frontend/src/App.tsx` | **路由表**（20 条路由 + 兜底重定向）+ 三步提交流程的共享状态与全部业务动作（草稿、OCR 结果注入、重新编辑、材料删除级联） | 是 | 文件本身 |
| `frontend/src/pages/` | 18 个页面组件，一文件一页面 | 是 | 目录内容 |
| `frontend/src/components/` | 跨页面复用组件（`Icon` / `RuleTips` / `DetailTable` / `FileUploader` / `StepIndicator` / `SubmissionDetailModal` / `TypeBadges` / `TopNav` / `OrgAutocomplete` / `Feedback`） | 否 | 目录内容 |
| `frontend/src/config/` | 前端侧静态配置：材料镜像、社团名单、操作指南文案 | 是 | 目录内容 |
| `frontend/src/utils/` | 目前只有 `timeRange.ts`（时间范围预设筛选） | 否 | 目录内容 |
| `frontend/src/types.ts` | 前端共享类型；字段名靠手工与后端对齐（**无自动生成**） | 是 | 文件本身 |
| `frontend/public/` | 静态资源：操作指南截图（`guide/` 下 23 张 PNG）、logo | 否 | `frontend/src/config/guides.ts` 的 11 处 `image` 引用与目录内文件逐一对应 |

---

## 3. 惯例与范例 ★

**框架常识不算惯例，以下是这个项目自己的选择。**

### 3.1 路由与 handler

- **所有路由写在 `backend/main.py`**，本项目没有 `routers/` 目录、没有 `APIRouter`。
- handler 命名现状有两条线：带角色语义的路由用 `api_` 前缀（`backend/main.py::api_login`、`backend/main.py::api_member_stats`、`backend/main.py::api_review_list`、`backend/main.py::api_list_applications`）；提交主链路的 handler 用动词名（`backend/main.py::submit_package`、`backend/main.py::validate`、`backend/main.py::generate_excel`、`backend/main.py::ocr_invoices`）。
- 页面级权限**写在 `frontend/src/App.tsx::App` 的 `<Route element={...}>` 三元表达式里**（形如 `auth?.user?.is_admin ? <页面/> : <Navigate to="/login" />`），没有独立的守卫组件、没有 loader；后端接口本身不逐条校验 token。

### 3.2 service 层

- **模块级函数，不用类**（`backend/draft_service.py`、`backend/user_service.py`、`backend/review_service.py`、`backend/application_service.py`、`backend/appeal_service.py` 全是 `def`）。
- **手写 SQL + `%s` 占位符**，连接写法固定为：`conn = get_connection()` → `try:` → `with conn.cursor() as cur:` → 写操作 `conn.commit()` → `finally: conn.close()`。
- 返回值是**普通 dict / list[dict]**，不返回 dataclass（字符串化时间用 `.isoformat()`，空值给 `""`）。
- 涉及 JSONB 的写入统一 `json.dumps(..., ensure_ascii=False)`。
- 按用户隔离的数据，函数签名带 `user_email: str = ""`（空值表示"不过滤"）。

**范例**：新增一个 service 时，照 **`backend/draft_service.py::save_draft`** 抄——函数签名形态、`get_connection()` + `try/finally` + `with conn.cursor()` 的连接获取、`%s` 参数化、`conn.commit()`、返回值结构，全部照它。

### 3.3 前端页面

- 每个页面是 **`export default function ComponentName()`** 的单文件组件，放在 `frontend/src/pages/`。
- **直接 `fetch('/api/v1/...')`**，不经过任何 api 客户端模块；POST 用 `JSON.stringify(data)` + `headers: {'Content-Type': 'application/json'}`。
- 页面结构固定：返回按钮（`Icon name="arrow-left"`）→ `page-head`（`<h1>` + `page-head-sub`）→ 列表/表单主体 → `loading` / `empty` 两个分支。
- 列表项用 `submission-list` / `submission-item`，状态用 `badge badge-ok|badge-warn|badge-error|badge-purple|badge-gold` 类。
- 图标统一用 `frontend/src/components/Icon.tsx::Icon` 的 `name` 属性，不内联 SVG。

**范例**：新增一个"列表 + 一个操作按钮"的管理端页面时，照 **`frontend/src/pages/AdminPermissions.tsx::AdminPermissions`** 抄——`useState`/`useEffect` 加载、`fetch` 写法、`page-head` + 列表 + 徽章的排版方式，全部照它。

### 3.4 配置与常量

- 后端常量集中在 `backend/config.py`，值优先从环境变量取（`os.getenv` / 自有 `.env` 加载器），代码里写的是**默认值**。
- 报销类型/材料清单这类需要前后端一致的配置放在专门的配置模块（后端 `backend/reimbursement_types.py`、前端 `frontend/src/config/materials.ts`），**不在页面里硬编码**。
- 审核端快捷批注模板分两级：**材料级**写在 `frontend/src/config/materials.ts::MATERIALS` 各材料的 `quickComments`；**报销表/拼接信息级**写死在 `frontend/src/pages/ReviewMaterials.tsx::FORM_QUICK`（5 条）。`frontend/src/pages/AdminAppeals.tsx` 复用同一套（管理员端叫"处理意见"）。

---

## 4. 改动配方 ★

### 4.1 新增一个接口

1. 在 `backend/main.py` 加 `@app.post("/api/v1/...")` + `async def api_xxx(...)` —— 路由**全部**在这个文件里。
2. 业务逻辑写进 `backend/xxx_service.py` 的新函数，照 `backend/draft_service.py::save_draft` 抄。
3. 需要落库 → 用 `backend/database.py::get_connection()`；需要新表/新列 → 改 `backend/database.py::init_db()`（见 5.1）。
4. 前端调用写在对应页面里，直接 `fetch`（照 `frontend/src/pages/AdminPermissions.tsx::AdminPermissions` 的 `load` 函数）。

### 4.2 新增一个页面

1. 在 `frontend/src/pages/` 新建 `XxxPage.tsx`，照 `frontend/src/pages/AdminPermissions.tsx::AdminPermissions` 抄页面骨架。
2. 在 `frontend/src/App.tsx::App` 的 `<Routes>` 里注册路由；需要角色限制 → 用同一处已有的守卫判断（`is_admin` / `is_reviewer` / `can_choose_role`）。
3. 需要入口 → 加到 `frontend/src/components/TopNav.tsx::TopNav` 或对应工作台页面（`frontend/src/pages/HomePage.tsx::HomePage` 的卡片区）。
4. 需要新样式 → 加到 `frontend/src/index.css`，复用已有的 `btn` / `badge` / `card` / `submission-list` 前缀类。

### 4.3 新增一张表 / 一个字段

1. **只改 `backend/database.py::init_db()`**，加一条带守卫的语句：新表用 `CREATE TABLE IF NOT EXISTS`，新列用 `DO $$ ... EXCEPTION WHEN duplicate_column`。
2. **不要引入 Alembic 或其他迁移工具**，不要新建 `migrations/` 目录。
3. `init_db()` 整体单事务，失败会整体回滚；加语句时保持"重跑无害"。
4. 参考同类语句：`backend/database.py::init_db` 里 `drafts` 表的建表 + `user_email` 兼容列就是标准样板。

### 4.4 新增一种报销类型 / 改材料数量

1. 改 `backend/reimbursement_types.py::REIMBURSEMENT_TYPES`（类型列表）与 `backend/reimbursement_types.py::MATERIALS` / `backend/reimbursement_types.py::TYPE_MATERIALS`（材料清单）。
2. **同步改 `frontend/src/config/materials.ts`** 的 `SELECTABLE_TYPES` / `MATERIALS` / `TYPE_MATERIALS` / `TYPE_OVERRIDES` / `TAB_LABELS`；两端不一致会导致前端传的材料 key 后端不认。注意前端也有 `TYPE_MATERIALS`，别只改后端那份。
3. 前端类型联合 `frontend/src/types.ts::ReimbursementType` 与后端名称须一致。
4. 需要新文案 → 加进 `frontend/src/components/RuleTips.tsx::RuleTips` 的调用处或 `backend/reimbursement_types.py::TYPE_LABELS`。
5. **新增类型**还要补 `frontend/src/config/materials.ts::TYPE_CONFIGS`（`color` / `icon` / `description`，前端独有）；漏了会被 `frontend/src/config/materials.ts::typeLabel` / `frontend/src/config/materials.ts::typeColor` 兜底成 `vat` 的名称与颜色。

**两端字段名不同，不是同名对拷**——按语义对位：

| 语义 | 后端 `backend/reimbursement_types.py::MATERIALS` | 前端 `frontend/src/config/materials.ts::MATERIALS` |
|---|---|---|
| 中文名 | `label` | `label` |
| 允许扩展名 | `accept_exts`（set 字面量） | `accept`（逗号分隔字符串） |
| 张数下限 | `min_count` | `minCount` |
| 张数上限 | `max_count`（`None` = 不限） | `maxCount`（`null` = 不限） |
| 是否走 OCR | `use_ocr` | `useOCR` |

- **仅前端有的字段**：`key` / `icon` / `hint` / `quickComments`（审核端快捷批注模板）。后端**没有**对应物，不要为了「对齐」把它们加进后端。
- **仅后端有的字段**：`zip_folder` / `zip_prefix` / `max_size_mb` / `upload_subdir`——决定 ZIP 内目录结构与落盘位置，前端不参与。

### 4.5 新增一条报销表校验规则

1. 在 `backend/validation_rules.py` 写 `def check_xxx(...)`，返回错误信息字符串（无错误返回空）。
2. 把函数名**加进 `backend/validation_rules.py::RULES` 列表**——`backend/validator.py::validate_form` 是按这个列表遍历的，不加进去就不会执行。
3. 前端提示若要同步，改 `frontend/src/pages/FillForm.tsx::handleValidate` 里的本地检查与 `frontend/src/components/RuleTips.tsx::RuleTips` 的文案。

---

## 5. 硬约束与雷区

### 5.1 数据库与 schema

| 位置 | 约束 | 依据 |
|---|---|---|
| `backend/database.py::init_db` | **不要**引入 ORM、**不要**引入迁移工具；建表/改表只在这里加带守卫的语句 | 文件 docstring："迁移策略：每条语句自带守卫（to_regclass / IF NOT EXISTS / DO $$ ALTER / ON CONFLICT），每次启动重跑无害" |
| `backend/database.py::get_connection` | **必须**用它拿连接，**不要**新建连接池或自建 `psycopg2.connect` 散落在业务代码里 | 现有 service 全部经此函数（`backend/draft_service.py::save_draft` 等） |
| `backend/database.py::init_db` | 启动时由 `backend/main.py::startup` 自动执行；**不要**把它改成需要手动跑的脚本 | `backend/main.py::startup` |

### 5.2 鉴权与权限

| 位置 | 约束 | 依据 |
|---|---|---|
| `backend/user_service.py::login` | 该函数内置一个**硬编码的管理员账号**（用户名为 `admin`，一律映射为 `user_id 0` + `is_admin True`）。**不要**把这个分支删掉或改成查库，会直接锁死管理员入口 | 函数内的字面量分支 |
| `backend/main.py::api_me` | 也是把 `user_id == 0` 当管理员；改登录逻辑时必须同步改这里 | `backend/main.py::api_me` |
| `backend/main.py` 的多数接口 | **现状**：除 `backend/main.py::api_me` 会解析 token 外，其余接口不校验 token，用户身份由调用方传参（`user_email` 走 query/form）；全仓库没有 `Depends` 鉴权依赖。**改任何接口前先确认它现在怎么拿身份**，不要假设已有鉴权 | `backend/main.py::api_me`（唯一用了 `decode_token` 的地方）、`backend/main.py::api_member_stats` / `backend/main.py::api_list_submissions` 等的参数签名 |
| `backend/user_service.py::register` | 邮箱域名决定初始角色：`@cuhk.edu.cn` → 审核员，`@link.cuhk.edu.cn` → 报销人，其余拒绝。**不要**放宽域名判断 | `backend/user_service.py::get_email_domain` |
| `backend/user_service.py::login` | `can_choose_role` 只在「link 账号且已是审核员」或「管理员且已是审核员」时为真，决定登录后是否出现身份选择页 | `backend/main.py::api_login` 返回值中的 `can_choose_role` |
| `backend/main.py::app` | CORS 白名单只放了 `http://localhost:5173` 与 `http://127.0.0.1:5173`；改端口/换域名必须同步这里的 `CORSMiddleware` 配置 | `backend/main.py::app` |

### 5.3 部署特化配置（换环境即失效）

| 位置 | 约束 | 依据 |
|---|---|---|
| `backend/config.py::EXPECTED_BUYER_NAME` / `backend/config.py::EXPECTED_TAX_ID` | 发票抬头校验的期望值写死为"香港中文大学（深圳）"与对应税号。**换单位部署必须改这两项**，否则 OCR 校验全部报错 | `backend/ocr_field_mapping.py::OCRResult.buyer_name_valid` 的说明 + `报销人提交规则提示.md` §2 |
| `backend/invoice_annotator.py::_load_font` | 字体路径写死为 Windows 路径（`C:/Windows/Fonts/...`），非 Windows 环境会走 DejaVu 兜底。**不要**在没有验证的情况下删改这段兜底 | `backend/invoice_annotator.py::_load_font` |
| `backend/config.py::TEMPLATE_PATH` / `backend/config.py::TEMPLATE_XLSX_PATH` | 指向仓库根的 `空白报销表.xls` 与 `template.xlsx`；**不要**移动或改名这两个文件 | `backend/config.py` 中的常量定义 |
| `backend/config.py::DB_PORT` | 默认端口 `5435`（不是 5432） | `backend/config.py` |
| `backend/config.py::HOST` / `backend/config.py::PORT` | 后端默认监听 `127.0.0.1:7999`；前端 dev server 的 `/api` 代理目标也写死成这个地址 | `backend/config.py`、`frontend/vite.config.ts` |

### 5.4 双份维护的事实源

| 位置 | 约束 | 依据 |
|---|---|---|
| `backend/reimbursement_types.py` ↔ `frontend/src/config/materials.ts` | **必须成对修改**。后端是唯一事实源，前端是镜像；`frontend/src/config/materials.ts::SELECTABLE_TYPES` 当前**不含** `bulk`（大量发票），后端 `backend/reimbursement_types.py::REIMBURSEMENT_TYPES` **含** `bulk` | `backend/reimbursement_types.py` docstring："以后端为准，修改材料配置时请同步两端"；`frontend/src/config/materials.ts::SELECTABLE_TYPES` 的注释"大量发票已并入普通增值税，仅历史数据保留展示" |
| `frontend/src/config/materials.ts` 的 `quickComments` / `icon` / `hint` / `key` | **前端独有字段**，后端 `backend/reimbursement_types.py::MATERIALS` 无对应物。改这些**不必**动后端；也不要为了「两端一致」把它们加到后端去 | `frontend/src/config/materials.ts::MaterialConfig` 与 `backend/reimbursement_types.py::MATERIALS` 的字段逐个比对（后者只有 `label` / `zip_folder` / `zip_prefix` / `accept_exts` / `max_size_mb` / `min_count` / `max_count` / `use_ocr` / `upload_subdir`） |
| `frontend/src/types.ts::ReimbursementType` / `frontend/src/types.ts::MaterialKey` | 与后端名称**手工对齐**，没有代码生成。改名时必须两头一起改 | `frontend/src/types.ts` 的注释："与后端 reimbursement_types.py 的 MATERIALS 一致" |

### 5.5 无测试覆盖的核心逻辑（改动后没有自动化回归保护）

本仓库**没有任何自动化测试、没有 lint、没有 CI**（详见第 9 节）。因此凡是核心链路都按"改完只能靠手工验证"对待：

| 位置 | 约束 | 依据 |
|---|---|---|
| `backend/main.py::submit_package` | 提交主流程。改这里必须手工走完三步向导再提交一次，确认 ZIP 内容与数据库记录同时正确 | 函数体同时负责材料落盘、注解、Excel 生成、打包、落库 |
| `backend/database.py::init_db` | 唯一改表途径，且**每次启动都会执行**；写错会影响所有环境的下一次启动 | `backend/main.py::startup` |
| `backend/packager.py::create_submission_package` | ZIP 内目录结构（`报销表/` 与 `{类型}/{材料}/` 两级）是审核端与重新编辑流程的输入，**不要**改目录层级或命名 | `backend/packager.py::create_submission_package` 的参数 `nested` |
| `backend/validator.py::validate_form` | 校验入口，前端提交前与后端接收时都走它；改规则要确认 `backend/validation_rules.py::RULES` 的顺序 | `backend/main.py::submit_package`、`backend/main.py::validate` |
| `frontend/src/App.tsx::updateInvoiceItems` / `frontend/src/App.tsx::updateInvoice` | 负责明细行与报销金额的自动同步（含"用户改过就不再自动覆盖"的判断）。改这里会同时影响报销表与提交数据 | `frontend/src/App.tsx` 中这两个函数 |
| `frontend/src/pages/UploadMaterials.tsx::typeComplete` | 决定"某类型材料是否算齐"（发票类要求材料张数与报销表发票区块数相等）；改它会直接放过/拦下提交 | `frontend/src/pages/UploadMaterials.tsx::typeComplete` |

---

## 6. 文档与代码不一致（本次核对出的全部）

以下每条的左边是仓库内文档的说法，右边是代码里的实际行为。

| 文档说法 | 出处 | 代码实际 | 代码定位 |
|---|---|---|---|
| "后端默认使用 pdfplumber 解析 PDF 电子发票" | `README.md` | 默认引擎是**百度 OCR**：`OCR_ENGINE` 默认值为 `"baidu"`，`get_ocr_engine()` 据此返回 `BaiduOCREngine`；pdfplumber 只是 `else` 分支 | `backend/config.py::OCR_ENGINE`、`backend/ocr.py::get_ocr_engine` |
| 指引用户"编辑 `backend/config.py`"填 OCR Key | `README.md` | 代码支持从 `backend/.env` 读取（自定义加载器用 `os.environ.setdefault`），**不需要改源码**；`backend/.env` 已在 `.gitignore` 中 | `backend/config.py`（模块级 `_ENV_PATH` 加载循环）、`.gitignore` |
| 项目结构里写 `ManagePermissions.tsx` | `README.md` | 实际文件名是 `frontend/src/pages/AdminPermissions.tsx`，无 `ManagePermissions.tsx` | `frontend/src/pages/AdminPermissions.tsx::AdminPermissions` |
| 项目结构里写 `frontend/public/logo.png` | `README.md` | 实际是 `logo-large.png` 与 `logo-horizontal.png`（被 `frontend/src/components/TopNav.tsx::TopNav` 等引用），无 `logo.png` | `frontend/src/components/TopNav.tsx::TopNav` |
| 项目结构仅列出部分页面 | `README.md` | 结构清单漏列 10 个已存在的页面：`AdminAppeals` / `AdminDashboard` / `GuidePage` / `MemberAppeals` / `MemberFeedback` / `MemberHistory` / `ReviewerHistory` / `ReviewMaterials` / `RoleSelectPage` / `ReviewSubmit` | `frontend/src/pages/` 目录内容 |
| 规则提示卡写"单项报销超 **2000 元**需附付款截图" | `frontend/src/pages/FillForm.tsx` 里传给 `RuleTips` 的 `items` 文案 | 现行规则是 **≥1000 元**归大额报销，且后端按 1000 拦截；`报销人提交规则提示.md` 更新记录（2026-08-30）已声明"原 2000 元规则并入" | `frontend/src/components/RuleTips.tsx::RuleTips`（调用处：`frontend/src/pages/FillForm.tsx::FillForm`）、`backend/validation_rules.py::check_large_amount_type`、`backend/validation_rules.py::_LARGE_AMOUNT_THRESHOLD` |
| `ReimbursementFormData` 的 docstring：`actual_total` = Σ**所有明细行(单价×数量)** | `backend/validation_rules.py` | 前端实际按 Σ**各发票区块的 `reimbursement_amount`** 计算 | `frontend/src/App.tsx::updateInvoice`、`frontend/src/types.ts::ReimbursementFormData.actual_total` |
| `.env.example` 只给 4 个键（`BAIDU_OCR_API_KEY` / `BAIDU_OCR_SECRET_KEY` / `DB_PASSWORD` / `JWT_SECRET`） | `backend/.env.example` | 代码实际读取的键有 9–11 个：另含 `OCR_ENGINE` / `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_NAME`（HOST / PORT 也可用环境变量覆盖）。照 `.env.example` 配会缺项 | `backend/config.py`、`backend/auth.py::JWT_SECRET`、`backend/.env`（本次仅提取键名，未读取值） |
| 上传材料页文案：活动凭证 1–2 张 | `frontend/src/pages/UploadMaterials.tsx` 里传给 `RuleTips` 的 `items` 文案 | 后端允许 1–20 张 | `frontend/src/components/RuleTips.tsx::RuleTips`（调用处：`frontend/src/pages/UploadMaterials.tsx::UploadMaterials`）、`backend/reimbursement_types.py::MATERIALS`（`evidence` 的 `min_count 1` / `max_count 20`） |
| 前端只提供 4 种报销类型可选 | `frontend/src/config/materials.ts::SELECTABLE_TYPES` | 后端支持 5 种（含 `bulk`），且 `backend/reimbursement_types.py::TYPE_OVERRIDES` 给 `bulk` 留了配置 | `backend/reimbursement_types.py::REIMBURSEMENT_TYPES` |
| `README.md` 未提及无测试/无 lint | `README.md` | 仓库无测试、无 lint、无 CI（前端 `build` 脚本 = `tsc && vite build`，兼作类型检查） | `frontend/package.json`、无 `.github/`、无 pytest/ruff/eslint 配置 |

---

## 7. 一次数据流：报销人提交一次报销

选这条的理由：它是本平台唯一一条串起前端三步向导、后端 OCR/校验/Excel/打包/落库的完整链路。

1. `frontend/src/pages/ReviewSubmit.tsx::handleSubmit` —— 组装 `FormData`：`types_json`、`previous_zip`、每个类型的 `{type}_{key}_files`（新传文件）与 `existing_{type}_{key}_paths`（复用/重新编辑的旧文件路径），POST 到 `/api/v1/submit`。
2. `backend/main.py::submit_package` —— 唯一的接收点，`request: Request` 手取 form，先解析 `types_json` 与旧协议分支，再按 `backend/reimbursement_types.py::material_cfg` 逐类型逐材料捞文件。
3. `backend/main.py::_validate_file` → `backend/main.py::_save_upload` —— 按材料配置校验大小/格式，落盘到 `backend/config.py::UPLOADS_DIR` 下的对应子目录。
4. `backend/validator.py::build_form_data` → `backend/validator.py::validate_form` —— 把提交数据装配成 `backend/validation_rules.py::ReimbursementFormData`，逐条跑 `backend/validation_rules.py::RULES`；**校验不通过即在此返回，流程中断**。
5. `backend/invoice_annotator.py::annotate_invoice` —— 对每张发票图片/PDF 叠加社团名、活动名、经手人、金额，产物写进材料目录。
6. `backend/excel_generator.py::generate_reimbursement_excel` —— 用 `backend/config.py::TEMPLATE_XLSX_PATH` 模板生成报销表 Excel，落到 `backend/config.py::SUBMISSIONS_DIR`。
7. `backend/packager.py::create_submission_package` —— 打成 ZIP（`报销表/` + 按类型分层的材料目录），命名 `报销申请_{活动名}_{时间戳}.zip`，冲突时加随机后缀重试。
8. `backend/main.py::submit_package` —— 用 `backend/database.py::get_connection()` 向 `submissions` 表插入记录（`zip_filename` / `user_email` / `reimb_type` / `reimb_types` / `status` / `activity_name` / `org_name` / `parent_id` / `form_data`），返回 `zip_filename`。

**链路到此为止是本条数据流的终点**：审核动作是另一条独立的流（`backend/review_service.py::approve_submission` 等），不在本条内。

**【推断】** 重新编辑提交时 `parent_id` 指向被打回的旧记录、`status` 记为 `resubmitted`——依据是第 8 步的 INSERT 语句列名含 `parent_id` 与 `status`，且前端 `frontend/src/pages/ReviewSubmit.tsx::handleSubmit` 会带上 `previous_zip`；但本次**未逐字段核对 status 的取值分支**，见第 11 节。

---

## 8. 业务规则

规则的来源分三类，**每条都标明依据**。`报销人提交规则提示.md` 自身用了三级标注（【系统自动校验】/【需自行注意】/【离线动作】），下面沿用它的口径。

### 8.1 发票抬头

- **发票购买方名称必须是"香港中文大学（深圳）"，税号必须是 `12440300066312613F`**（大写 F）；OCR 识别后会与本期望值比对，不匹配则在前端标黄警示。依据：`backend/config.py::EXPECTED_BUYER_NAME` / `backend/config.py::EXPECTED_TAX_ID`、`backend/ocr_field_mapping.py::OCRResult.buyer_name_valid`。
- **换单位部署时必须重写这两项与 `报销人提交规则提示.md`**，该文档明确写了"其他部门/组织部署本平台时请勿沿用"。依据：`报销人提交规则提示.md` 开头说明。

### 8.2 金额

- **不得报销预付卡**（如星巴克预付卡）。依据：`报销人提交规则提示.md` §3.6（标注为【需自行注意】，后端无对应拦截）。
- **单品尽量不超过 1000 元；数量叠加超过 1000 元没有问题**。依据：`报销人提交规则提示.md` §3.6（标注为【需自行注意】）。
- **单项报销金额 ≥1000 元必须归入「大额报销」类型**，否则后端拦截并提示改选；大额报销必传「供应商明细表单」与「支付凭证」。依据：`backend/validation_rules.py::check_large_amount_type`（阈值常量 `backend/validation_rules.py::_LARGE_AMOUNT_THRESHOLD = 1000`）、`backend/reimbursement_types.py::TYPE_MATERIALS` 中 `large` 的材料组合。
- **每张发票区块的报销金额不得超过该发票的价税合计；明细行金额合计不得超过报销金额**。依据：`backend/validation_rules.py::check_reimbursement_le_invoice`、`backend/validation_rules.py::check_detail_rows_complete`。
- **总额超过 1 万元需联系 OSA**（线下动作，系统内无拦截）。依据：`报销人提交规则提示.md` §3.6。
- 单张发票允许负数的情形由 `backend/validation_rules.py::_invoice_allow_negative` 单独判定（如红冲/折扣场景），**不要**在别处另写一套负数判断。

### 8.3 材料

- **每个报销类型至少要有 1 张发票，且每个发票区块必须齐**；三类材料（发票 / 活动凭证 / 其他）的数量上下限取自后端配置，前端页面文案不得自行另写数字。依据：`backend/validation_rules.py::check_invoice_sections_exist`、`backend/reimbursement_types.py::MATERIALS`。
- **出行报销的发票标签显示为「交通票据」、大量发票类型的发票上限放宽到 30**——这些差异写在类型覆盖表里，不要写进通用材料表。依据：`backend/reimbursement_types.py::TYPE_OVERRIDES`。
- **时间**：活动结束日期与报销日期不得晚于当天。依据：`frontend/src/pages/FillForm.tsx` 的日期选择限制与 `backend/validation_rules.py::check_required_fields`。
- **支付宝账号必须是手机号（`1[3-9]` 开头 11 位）或邮箱**。依据：`backend/validation_rules.py::check_alipay_format`、`frontend/src/pages/FillForm.tsx` 的本地正则。
- **公对公转账要逐张发票标注**（发票标题行右侧开关，默认"否"，审核端可见）。依据：`报销人提交规则提示.md` §4.5、`frontend/src/types.ts::InvoiceSection.is_public_transfer`。
- **提交后必须线下交付纸质材料**（系统不处理）。依据：`报销人提交规则提示.md` §6、`frontend/src/pages/ReviewSubmit.tsx` 成功面板的提示文案。

### 8.4 角色与流程

- **注册邮箱域名决定初始身份**：`@cuhk.edu.cn` 注册即审核员，`@link.cuhk.edu.cn` 注册即报销人。依据：`backend/user_service.py::register`。
- **只有同时是 link 账号（或管理员）且已是审核员的人，登录后才能选择身份**；其余直接进各自工作台。依据：`backend/user_service.py::login` 返回的 `can_choose_role`、`frontend/src/pages/RoleSelectPage.tsx::RoleSelectPage`。
- **报销人可自行申请成为审核员/管理员，由管理员审批**；审批通过后按申请时的角色授予。依据：`backend/application_service.py::submit_application` / `backend/application_service.py::approve_application`、`frontend/src/pages/AdminPermissions.tsx::AdminPermissions`。
- **两类申诉**：材料被打回、已通过但未到账。依据：`backend/appeal_service.py::create_appeals`、`frontend/src/pages/MemberAppeals.tsx::MemberAppeals`。
- **审核侧的报销进度只有两档**：`报销流程中` / `已报销`，由审核员在历史审核页切换。依据：`backend/review_service.py::update_reimburse_progress`、`frontend/src/pages/ReviewerHistory.tsx::ReviewerHistory`。

---

## 9. 验证命令

> ⚠️ **以下命令全部未经实际执行验证**——本次分析在只读约束下进行，没有执行任何命令，命令是否可用、参数是否正确，**需要你自己跑一次确认**。

| 目的 | 命令 | 出处 |
|---|---|---|
| 起数据库 | `docker compose up -d` 或 README 中给出的 PostgreSQL 容器（端口 `5435`） | `README.md`、`backend/config.py::DB_PORT` |
| 起后端 | 在 `backend/` 下 `python main.py`（监听 `127.0.0.1:7999`；启动时自动建表） | `backend/main.py` 的 `__main__` 分支、`backend/main.py::startup` |
| 起前端 | 在 `frontend/` 下 `npm run dev`（`5173`，`/api` 代理到 `127.0.0.1:7999`） | `frontend/package.json`、`frontend/vite.config.ts` |
| 前端类型检查 + 构建 | 在 `frontend/` 下 `npm run build`（脚本内容为 `tsc && vite build`，**这是本仓库唯一的静态检查手段**） | `frontend/package.json` |
| 健康检查 | `GET /api/v1/health`（返回 `{"status":"ok","engine":<OCR 引擎类名>}`） | `backend/main.py::health` |
| 单文件 OCR 冒烟 | `POST /api/v1/ocr/invoice` 传一个 PDF/图片 | `backend/main.py::ocr_invoice` |
| 表单校验冒烟 | `POST /api/v1/validate` 传报销表单 JSON | `backend/main.py::validate` |

### 自动化回归保护：**没有**

- **没有测试框架**：仓库内无 `pytest.ini` / `tox.ini` / `setup.cfg`，`frontend/package.json` 里**没有 `test` 脚本**。
- **没有 lint**：`frontend/package.json` 里**没有 `lint` 脚本**，无 ESLint / Prettier 配置文件；Python 侧无 ruff / flake8 / mypy 配置。
- **没有 CI**：仓库根无 `.github/` 目录。
- `backend/_test_multi_type.py` **不是测试套件**——它的 docstring 自述"临时测试：多类型报销端到端（测试库 reimbursement_test，端口 7998）。跑完即删，自动清理测试文件。"它连的是另一个测试库、另一个端口，**不要**把它当回归测试跑，也不要把它加进 CI。
- 结论：**改完代码没有自动化手段能告诉你有没有改坏**，只能手工起服务走一遍相关流程；数据库改动还要额外确认重启时 `backend/database.py::init_db()` 仍能通过。

---

## 10. 变动中 / 不稳定区域

以下区域在代码或文档里**明确留下了"新旧并存"的痕迹**，改动时按两套都在用来对待。

| 区域 | 现状 | 依据 |
|---|---|---|
| 报销类型：后端 5 种 vs 前端 4 种 | 后端保留 `bulk`（大量发票），前端 `SELECTABLE_TYPES` 已去掉它，注释写"已并入普通增值税，仅历史数据保留展示"——即**历史数据里仍有 bulk 记录需要能显示** | `backend/reimbursement_types.py::REIMBURSEMENT_TYPES`、`frontend/src/config/materials.ts::SELECTABLE_TYPES` 及其注释 |
| 提交协议的两种形态 | `backend/main.py::submit_package` 同时支持 `types_json`（多类型）与旧的单类型协议分支，材料字段有两套命名：`{type}_{key}_files` 与 `existing_{type}_{key}_paths` | `backend/main.py::submit_package` |
| 表名/列名迁移痕迹 | `init_db` 中有从 `submissions_data` 改名为 `submissions` 的迁移、按 `SUBMISSIONS_DIR` 目录回填孤儿记录、索引补齐等历史语句 | `backend/database.py::init_db` |
| 规则的换代 | "单项超 2000 元附支付凭证"已被 "≥1000 元归大额报销"取代；前端 `RuleTips` 文案**尚未同步**（见第 6 节） | `报销人提交规则提示.md` 更新记录、`frontend/src/pages/FillForm.tsx::FillForm` 中传给 `RuleTips` 的文案 |
| 自助注册 vs 管理员审批 | 注册按域名直接给审核员身份，同时又有"申请权限 → 管理员审批"这条通道，两条路并存 | `backend/user_service.py::register`、`backend/application_service.py::submit_application` |
| 手写体字段 | OCR 结果结构里保留了 `handwritten_*` 四个字段，注释写"第一版预留，暂不提取" | `backend/ocr_field_mapping.py::OCRResult` 中 `handwritten_activity_name` 等的注释 |

---

## 11. 未确认清单

| 问题 | 我尝试过什么 | 需要谁确认 |
|---|---|---|
| `submissions` 表的 `status` 字段究竟有哪些取值（初审/已通过/已打回/已重审） | 读了 `backend/main.py::submit_package` 的 INSERT 列名、`backend/review_service.py::approve_submission` / `backend/review_service.py::reject_submission` / `backend/review_service.py::get_review_status`，但未逐分支核对全部字面量 | 原作者 |
| `.env` 的实际值与 `backend/.env.example` 的差异是否会直接导致启动失败 | 只提取了 `backend/.env` 的**键名**（未读取值，避免把密钥写进上下文），确认键集会多于 `.env.example`；未做缺键时的行为实验 | 部署者 |
| `DEV_LOG.md` 与 `功能手册.md` 的内容 | 两者都存在，但 `DEV_LOG.md` 含百度云 AK/SK 与测试账号（被 `.gitignore` 忽略），**本次刻意未读**；`功能手册.md` 未读 | 原作者 |
| 前端 `npm run build` 当前是否能通过 | 未执行任何命令。`build` 脚本本身就是类型检查，不通过则构建失败 | 你自己跑一次 |
| 具体 UI 的视觉细节（布局、色彩、响应式表现） | 本次只读了 JSX 与 `frontend/src/index.css` 的类名约定，未渲染页面 | 需要时自行起前端 |
| 数据库真实数据规模与历史遗留数据的形态 | 只读了代码，未连库 | 部署者 |

---

## 12. 覆盖范围声明

**本次分析了什么**

- `backend/`：目录下全部 18 个 `.py` 文件都读过——`main.py`、`database.py`、`config.py`、`validation_rules.py`、`reimbursement_types.py`、`ocr.py`、`ocr_field_mapping.py`、`excel_generator.py`、`packager.py`、`invoice_annotator.py`、`auth.py`、`validator.py`、`draft_service.py`、`user_service.py`、`review_service.py`、`application_service.py`、`appeal_service.py`、`_test_multi_type.py`。**读取方式：主流程文件（`main.py`、`database.py`、`config.py`、`validation_rules.py`、`reimbursement_types.py` 等）为全文读取；其余为 docstring、函数定义与关键代码片段。**
- `frontend/`：`src/` 下全部页面组件、全部组件、全部配置文件、`types.ts`、`App.tsx`；`package.json`、`vite.config.ts`、`tsconfig.json`。
- 根目录：`README.md`、`.gitignore`、`报销人提交规则提示.md`（逐节读）、`backend/.env.example`。
- 后端接口：`backend/main.py` 中 35 个路由的定义与用途逐个确认。

**没覆盖什么**

- **未执行任何命令**：没跑过构建、没跑过测试、没起过服务、没连过数据库。所有"运行方式"与"验证命令"均为读代码得出，**未经实际执行验证**。
- **未使用 git 历史**：没跑任何 git 子命令，不看提交记录、不看 diff。
- 未读 `frontend/node_modules/`（依赖内容与项目无关）、`.git/`、`Logo源文件/`。
- 两个二进制模板（`空白报销表.xls`、`template.xlsx`）**只确认存在，未打开**，因此 `backend/excel_generator.py::generate_reimbursement_excel` 往模板的哪个单元格写什么，本次**没有核对**。
- `DEV_LOG.md`（含密钥，刻意未读）与 `功能手册.md`（未读）。
- **看了但没写进来的**：每个页面的逐条 UI 文案细节（按钮文字、表头、空状态），本次只提取到能支撑"界面一览"的程度，未逐字落盘。
- 未对代码质量、结构或性能做任何评价，未给出改进路线图或时间安排——本文只描述现状与约束。

**给人类读者的入口**：非技术读者请读同目录的 `项目概览.md`；本文是给要动代码的 AI/工程读者看的。
