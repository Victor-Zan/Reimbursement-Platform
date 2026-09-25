## 项目上下文

改代码前先读 `docs/onboarding/AI-上手.md`（项目上手手册：目录职责、惯例与范例、改动配方、雷区与硬约束、文档与代码不一致清单、未确认清单）。

- 不要引入 ORM 或迁移工具；SQL 手写，建表/改表只改 `backend/database.py::init_db`（每次启动都会执行）。
- 报销类型与材料清单以 `backend/reimbursement_types.py` 为唯一事实源，改它必须同步改 `frontend/src/config/materials.ts`。
- 新增接口一律写在 `backend/main.py`，业务逻辑写进 `backend/xxx_service.py`；不要拆 router 文件。
