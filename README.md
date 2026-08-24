# 报销自动化平台

> 香港中文大学（深圳）学生活动经费报销自动化系统

一个面向报销人与审核员的一站式报销管理平台：发票 OCR 自动识别、报销表自动生成、多角色审核流程、草稿管理与权限申请。

---

## ✨ 核心功能

### 报销人端
- **增值税报销**：上传多张发票 → 百度 OCR 自动识别 → 自动填充报销表 → 一键生成标准化 Excel 报销单
- **发票校验**：自动核对购买方名称与税号，异常即时标记
- **发票标注**：提交时在每张发票底部自动拼接（组织名称、活动名称、对应物品、金额）信息条
- **我的草稿**：填写中途可保存草稿（PostgreSQL 持久化），随时继续
- **查看历史提交**：按账户隔离，支持文件名搜索与日期筛选
- **审核反馈**：查看审核批注，被打回的材料可一键重新编辑（保留原数据，按批注类型智能跳转步骤）
- **申请成为审核员**：提交申请，审核通过后获得双重身份

### 审核员端
- **材料审核**：在线预览 ZIP 包内发票、活动凭证、报销表，逐项批注（含快捷批注模板）
- **状态管理**：待审核 / 已通过 / 已打回 / 已打回材料重审（重审材料红点提示）
- **统计仪表盘**：实时统计各状态数量
- **权限管理**：审批报销人提交的审核员申请

### 账户体系
- 邮箱域名自动判定角色：`@cuhk.edu.cn` = 审核员，`@link.cuhk.edu.cn` = 报销人
- 双重身份用户登录后自由选择进入界面
- JWT 认证 + bcrypt 密码哈希

---

## 📖 功能手册

- 面向**最终使用者**（报销人 / 审核员）的说明文档：`功能手册.md` —— 用大白话逐页介绍平台"能做什么、不能做什么"，含报销流程、材料要求速查与 FAQ。
- **给开发者的约定**：每当平台功能、页面或限制有更新，请**同步更新 `功能手册.md`**（新增/修改对应章节与 FAQ），保持手册与代码一致，并在提交说明中注明"同步更新功能手册"。

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + React Router |
| 后端 | Python FastAPI |
| 数据库 | PostgreSQL（Docker 部署） |
| OCR | 百度智能云增值税发票识别 API |
| 其他 | openpyxl（Excel 生成）、pdfplumber、Pillow、PyJWT |

---

## 🚀 快速开始

### 环境要求
- Python 3.10+
- Node.js 18+
- Docker（用于 PostgreSQL）

### 1. 启动数据库

```bash
docker run -d --name reimbursement-postgres \
  -e POSTGRES_USER=reimbursement \
  -e POSTGRES_PASSWORD=改成你自己的密码 \
  -e POSTGRES_DB=reimbursement_db \
  -p 5435:5432 postgres:15-alpine
```

> 密码需与 `backend/.env` 中的 `DB_PASSWORD` 保持一致。

### 2. 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
# 运行在 http://127.0.0.1:7999
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
# 打开 http://localhost:5173
```

### 4. 配置百度 OCR（可选）

后端默认使用 pdfplumber 解析 PDF 电子发票。如需支持图片发票，配置百度 OCR：

```python
# backend/config.py
OCR_ENGINE = "baidu"
BAIDU_OCR_API_KEY = "你的API Key"
BAIDU_OCR_SECRET_KEY = "你的Secret Key"
```

需在百度智能云控制台开通「增值税发票识别」接口，免费额度 2000 次/月。

---

## 📁 项目结构

```
报销自动化平台/
├── backend/
│   ├── main.py                 # FastAPI 入口与全部路由
│   ├── ocr.py                  # OCR 引擎（百度/PDF解析/Mock 可插拔）
│   ├── ocr_field_mapping.py    # OCR 结果数据结构
│   ├── invoice_annotator.py    # 发票信息条拼接
│   ├── excel_generator.py      # 报销表 Excel 生成（模板填充）
│   ├── validator.py            # 表单校验引擎
│   ├── validation_rules.py     # 可插拔校验规则
│   ├── packager.py             # 提交材料 ZIP 打包
│   ├── auth.py                 # JWT 签发/验证、密码哈希
│   ├── user_service.py         # 用户注册/登录
│   ├── review_service.py       # 审核批注 CRUD
│   ├── application_service.py  # 审核员申请管理
│   ├── draft_service.py        # 草稿 CRUD
│   ├── database.py             # PostgreSQL 连接与建表
│   ├── config.py               # 全局配置
│   └── submissions/            # 提交存档（ZIP）
├── frontend/
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   │   ├── LandingPage.tsx      # 公开首页
│   │   │   ├── LoginPage.tsx        # 登录
│   │   │   ├── RegisterPage.tsx     # 注册
│   │   │   ├── HomePage.tsx         # 报销人工作台
│   │   │   ├── UploadMaterials.tsx  # 步骤1：上传材料
│   │   │   ├── FillForm.tsx         # 步骤2：填写报销表
│   │   │   ├── ReviewSubmit.tsx     # 步骤3：确认提交
│   │   │   ├── ReviewerDashboard.tsx    # 审核员工作台
│   │   │   ├── ReviewMaterials.tsx     # 材料审核
│   │   │   └── ManagePermissions.tsx   # 权限管理
│   │   ├── components/         # 通用组件
│   │   └── index.css           # 全局样式（白底+紫金主题）
│   └── public/logo.png         # 校徽
├── 空白报销表.xls               # 报销表模板（原始）
└── template.xlsx               # 报销表模板（程序使用）
```

---

## 🔄 核心流程

```
报销人提交报销
  → 上传发票（多张）+ 活动凭证
  → OCR 识别（购买方/税号/明细/总额）
  → 填写报销表（OCR 预填 + 手动补全 + 实时校验）
  → 提交 → 发票拼接信息条 → 打包 ZIP
  → 审核员在线预览 → 确认通过 / 批注打回
  → 报销人收到反馈 → 重新编辑（保留原数据）→ 重新提交
  → 审核员在「已打回材料重审」栏看到红点提示 → 再次审核
```

---

## 🔧 扩展性设计

- **OCR 引擎可插拔**：`BaseOCREngine` 抽象基类，切换百度/腾讯/本地 OCR 只需新增子类
- **校验规则可插拔**：`validation_rules.py` 中注册函数即可新增规则
- **报销表模板可替换**：换 `template.xlsx` 无需改代码
- **数据库可迁移**：连接信息集中在 `config.py`，本地开发与服务器部署只差配置

---

## 📋 待办路线图

- [ ] 其他类报销（车票、船票、出租车票等，百度 OCR 接口已准备）
- [ ] 邮箱验证
- [ ] 邮件通知（审核通过/打回时）
- [ ] 财务端对账导出

---

## 📄 License

本项目仅供香港中文大学（深圳）学生组织内部使用。
