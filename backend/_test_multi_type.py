"""临时测试：多类型报销端到端（测试库 reimbursement_test，端口 7998）。跑完即删，自动清理测试文件。"""
import json, os, subprocess, sys, time, urllib.parse, urllib.request, urllib.error, uuid

os.environ["DB_NAME"] = "reimbursement_test"
os.environ["PORT"] = "7998"
os.environ["OCR_ENGINE"] = "mock"

BACKEND = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND)
START_TIME = time.time()

import config  # noqa: E402
import psycopg2  # noqa: E402

BASE = f"http://127.0.0.1:{config.PORT}"

# 1x1 透明 PNG
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fcffff3f030005fe02fea72dcc6d0000000049454e44ae426082"
)

passed, failed = [], []
def check(name, cond, extra=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra else ""))


def db_conn(dbname):
    return psycopg2.connect(host=config.DB_HOST, port=config.DB_PORT,
                            user=config.DB_USER, password=config.DB_PASSWORD, dbname=dbname)


def call(method, path, body=None, ctype="application/json", raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = body if raw else json.dumps(body).encode()
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def multipart(fields: list[tuple[str, str]], files: list[tuple[str, str, bytes]]):
    boundary = "----tb" + uuid.uuid4().hex
    chunks = []
    for name, value in fields:
        chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode("utf-8"))
    for name, filename, content in files:
        chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode("utf-8"))
        chunks.append(content)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return boundary, b"".join(chunks)


def submit_multi(fields, files):
    b, body = multipart(fields, files)
    return call("POST", "/api/v1/submit", body=body, ctype=f"multipart/form-data; boundary={b}", raw=True)


def today():
    return time.strftime("%Y-%m-%d")


def invoice(t: str, name: str, price: float, total: float):
    return {
        "buyer_name": "香港中文大学（深圳）", "buyer_tax_id": "12440300066312613F",
        "buyer_name_valid": True, "buyer_tax_id_valid": True,
        "invoice_date": today(), "invoice_total": total, "reimbursement_amount": total, "handler": "张三",
        "reimb_type": t,
        "items": [{"name": name, "unit_price": price, "quantity": 1, "amount": price, "purchase_channel": "网购", "reusable": "否", "source_invoice_item": True}],
    }


BASE_FIELDS = [
    ("activity_name", "多类型测试活动"), ("org_name", "测试组织"),
    ("activity_end_date", today()), ("reimbursement_date", today()),
    ("actual_total", "15"), ("finance_officer", "王五"),
    ("activity_leader_opinion", "同意"), ("alipay_account", "13800138000"),
    ("user_email", "a1@link.cuhk.edu.cn"), ("previous_zip", ""),
]

# 0. 测试库就绪
try:
    conn = db_conn(config.DB_NAME)
except Exception:
    c2 = db_conn("postgres"); c2.autocommit = True
    with c2.cursor() as cur:
        cur.execute(f'CREATE DATABASE {config.DB_NAME}')
    c2.close()
    conn = db_conn(config.DB_NAME)
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
conn.close()

from database import init_db  # noqa: E402
init_db()
init_db()
check("init_db 幂等", True)

server = subprocess.Popen([sys.executable, "main.py"], cwd=BACKEND, env=dict(os.environ),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
up = False
for _ in range(60):
    try:
        s, _ = call("GET", "/api/v1/health")
        if s == 200:
            up = True
            break
    except Exception:
        pass
    time.sleep(0.5)
check("测试服务器启动", up)
if not up:
    server.kill(); sys.exit(1)

created_zips = []
try:
    # 1. 多类型提交（vat+travel）
    invs = [invoice("vat", "测试物品A", 10.0, 10.0), invoice("travel", "客运服务费", -5.0, 5.0)]
    fields = BASE_FIELDS + [("types_json", json.dumps(["vat", "travel"])), ("invoices_json", json.dumps(invs))]
    files = [
        ("vat_invoices_files", "v_inv.png", PNG), ("vat_evidence_files", "v_evi.png", PNG),
        ("travel_invoices_files", "t_ticket.png", PNG), ("travel_rider_ids_files", "t_rid.png", PNG),
        ("travel_itinerary_files", "t_itin.png", PNG), ("travel_payments_files", "t_pay.png", PNG),
    ]
    s, j = submit_multi(fields, files)
    check("多类型提交 200（travel 负数单价通过）", s == 200 and j.get("success"), str(j)[:200])
    zip_name = j.get("zip_filename", "")
    created_zips.append(zip_name)

    # 2. ZIP 嵌套结构
    import zipfile as zf_mod
    zip_path = os.path.join(config.SUBMISSIONS_DIR, zip_name)
    with zf_mod.ZipFile(zip_path) as z:
        names = z.namelist()
    check("ZIP 含 增值税报销/发票/", any(n.startswith("增值税报销/发票/") for n in names), str(names))
    check("ZIP 含 路费报销/发票/", any(n.startswith("路费报销/发票/") for n in names))
    check("ZIP 含 报销表/", any(n.startswith("报销表/") for n in names))

    # 3. DB 行：reimb_type=mixed + reimb_types
    conn = db_conn(config.DB_NAME); cur = conn.cursor()
    cur.execute("SELECT reimb_type, reimb_types FROM submissions WHERE zip_filename=%s", (zip_name,))
    row = cur.fetchone()
    check("DB reimb_type=mixed, reimb_types=['vat','travel']", row and row[0] == "mixed" and row[1] == ["vat", "travel"], str(row))
    conn.close()

    # 4. vat 负数被拦
    bad_invs = [invoice("vat", "测试物品B", -3.0, 3.0)]
    s, j = submit_multi(BASE_FIELDS + [("types_json", json.dumps(["vat"])), ("invoices_json", json.dumps(bad_invs))],
                        [("vat_invoices_files", "b_inv.png", PNG), ("vat_evidence_files", "b_evi.png", PNG)])
    check("vat 负数单价被拦（明细行完整性）", s == 400 and any("单价" in e.get("message", "") for e in (j.get("detail") or {}).get("errors", [])), str(j)[:200])

    # 5. travel 票据数不匹配
    two = [invoice("travel", "票1", 5.0, 5.0), invoice("travel", "票2", 5.0, 5.0)]
    s, j = submit_multi(BASE_FIELDS + [("types_json", json.dumps(["travel"])), ("invoices_json", json.dumps(two))],
                        [("travel_invoices_files", "t1.png", PNG), ("travel_rider_ids_files", "r.png", PNG),
                         ("travel_itinerary_files", "i.png", PNG), ("travel_payments_files", "p.png", PNG)])
    check("travel 票据数不匹配 400", s == 400 and "不一致" in str(j.get("detail", "")), str(j)[:200])

    # 6. 预览 type_materials 分段
    s, j = call("GET", f"/api/v1/submissions/preview/{urllib.parse.quote(zip_name)}")
    tm = j.get("type_materials") or {}
    check("预览 type_materials 含 vat+travel", set(tm.keys()) == {"vat", "travel"} and "invoices" in tm["vat"] and "itinerary" in tm["travel"], str(tm.keys()))
    check("预览 legacy materials 合并", (j.get("materials") or {}).get("invoices", []) and (j.get("materials") or {}).get("evidence", []), "")

    # 7. 审核打回带前缀批注
    s, j = call("POST", "/api/v1/review/reject", {
        "submission_zip": zip_name, "reviewer_email": "r@cuhk.edu.cn",
        "invoice_comment": "", "evidence_comment": "", "form_comment": "重新核对",
        "material_comments": {"vat:invoices": "发票有误", "travel:itinerary": "行程单缺失"},
    })
    check("打回成功", s == 200 and j.get("success"))
    s, j = call("GET", f"/api/v1/review/annotations/{urllib.parse.quote(zip_name)}")
    mc = j.get("review", {}).get("material_comments") or {}
    check("前缀批注持久化", mc.get("vat:invoices") == "发票有误" and mc.get("travel:itinerary") == "行程单缺失", str(mc))

    # 8. 列表 reimb_types
    s, j = call("GET", "/api/v1/review/submissions")
    row = next((x for x in j["submissions"] if x["filename"] == zip_name), None)
    check("审核列表 reimb_types=['vat','travel']", row and row.get("reimb_types") == ["vat", "travel"] and row.get("reimb_type") == "mixed", str(row))
    s, j = call("GET", "/api/v1/submissions?user_email=" + urllib.parse.quote("a1@link.cuhk.edu.cn"))
    row = next((x for x in j["submissions"] if x["filename"] == zip_name), None)
    check("成员列表 reimb_types=['vat','travel']", row and row.get("reimb_types") == ["vat", "travel"], str(row))

    # 9. submission-data 嵌套 type_material_urls
    s, j = call("GET", f"/api/v1/submission-data/{urllib.parse.quote(zip_name)}")
    tmu = j.get("type_material_urls") or {}
    check("submission-data 嵌套 type_material_urls", "vat" in tmu and "travel" in tmu and "invoices" in tmu["vat"], str(tmu.keys()))
    check("form_data.types 存在", (j.get("form_data") or {}).get("types") == ["vat", "travel"])

    # 10. legacy 单类型提交（旧字段名）
    one = [{"buyer_name": "香港中文大学（深圳）", "buyer_tax_id": "12440300066312613F",
            "buyer_name_valid": True, "buyer_tax_id_valid": True, "invoice_date": today(),
            "invoice_total": 8.0, "reimbursement_amount": 8.0, "handler": "张三",
            "items": [{"name": "保险A", "unit_price": 8.0, "quantity": 1, "amount": 8.0, "purchase_channel": "网购", "reusable": "否", "source_invoice_item": True}]}]
    fields = BASE_FIELDS + [("type", "insurance"), ("invoices_json", json.dumps(one))]
    files = [("invoices_files", "i_inv.png", PNG), ("policy_files", "i_pol.png", PNG)]
    s, j = submit_multi(fields, files)
    check("legacy 单类型提交 200", s == 200 and j.get("success"), str(j)[:200])
    legacy_zip = j.get("zip_filename", "")
    created_zips.append(legacy_zip)
    with zf_mod.ZipFile(os.path.join(config.SUBMISSIONS_DIR, legacy_zip)) as z:
        names = z.namelist()
    check("legacy ZIP 平铺结构", any(n.startswith("发票/") for n in names) and any(n.startswith("保险保单/") for n in names), str(names))
    s, j = call("GET", f"/api/v1/submissions/preview/{urllib.parse.quote(legacy_zip)}")
    tm = j.get("type_materials") or {}
    check("legacy 预览 type_materials={insurance: materials}", set(tm.keys()) == {"insurance"} and "invoices" in tm["insurance"], str(tm.keys()))
    check("legacy 预览旧键保留", bool((j.get("materials") or {}).get("policy")), "")
    s, j = call("GET", "/api/v1/submissions?user_email=" + urllib.parse.quote("a1@link.cuhk.edu.cn"))
    row = next((x for x in j["submissions"] if x["filename"] == legacy_zip), None)
    check("legacy 列表 reimb_types=['insurance']", row and row.get("reimb_types") == ["insurance"] and row.get("reimb_type") == "insurance", str(row))

    # 11. 申诉回归（多类型行）
    conn = db_conn(config.DB_NAME); cur = conn.cursor()
    cur.execute("UPDATE submissions SET status='rejected' WHERE zip_filename=%s", (legacy_zip,))
    conn.commit(); conn.close()
    s, j = call("POST", "/api/v1/appeals", {"user_email": "a1@link.cuhk.edu.cn", "submission_zip": [legacy_zip], "reason": "不认可"})
    check("申诉创建", s == 200 and j.get("created") == 1)
    s, j = call("GET", "/api/v1/admin/appeals")
    ap = next((a for a in j["appeals"] if a["submission_zip"] == legacy_zip), None)
    check("申诉列表 reimb_types", ap and ap.get("reimb_types") == ["insurance"], str(ap))

finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except Exception:
        server.kill()
    # 清理：测试期间产生的 ZIP 与上传文件（避免污染真实库的孤儿回填）
    for z in created_zips:
        try:
            os.remove(os.path.join(config.SUBMISSIONS_DIR, z))
        except OSError:
            pass
    for root, dirs, files in os.walk(config.UPLOADS_DIR):
        for f in files:
            p = os.path.join(root, f)
            try:
                if os.path.getmtime(p) >= START_TIME - 5:
                    os.remove(p)
            except OSError:
                pass
    try:
        conn = db_conn(config.DB_NAME); conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        conn.close()
    except Exception:
        pass

print(f"\nPASS {len(passed)}  FAIL {len(failed)}")
if failed:
    for f in failed:
        print("  FAILED:", f)
    sys.exit(1)
