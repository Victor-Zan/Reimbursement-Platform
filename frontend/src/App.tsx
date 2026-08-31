import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoleSelectPage from './pages/RoleSelectPage';
import TopNav from './components/TopNav';
import ReviewerDashboard from './pages/ReviewerDashboard';
import ReviewMaterials from './pages/ReviewMaterials';
import ReviewerHistory from './pages/ReviewerHistory';
import AdminDashboard from './pages/AdminDashboard';
import AdminPermissions from './pages/AdminPermissions';
import AdminAppeals from './pages/AdminAppeals';
import MemberAppeals from './pages/MemberAppeals';
import MemberHistory from './pages/MemberHistory';
import MemberFeedback from './pages/MemberFeedback';
import UploadMaterials from './pages/UploadMaterials';
import FillForm from './pages/FillForm';
import ReviewSubmit from './pages/ReviewSubmit';
import HomePage from './pages/HomePage';
import GuidePage from './pages/GuidePage';
import { OCRResult, ReimbursementFormData, InvoiceSection, DetailRow, ReimbursementType, MaterialKey } from './types';
import { SELECTABLE_TYPES } from './config/materials';
import { useFeedback } from './components/Feedback';

const STORAGE_KEY = 'reimbursement_auth';

/** 本地时区的今天（YYYY-MM-DD），避免 toISOString 的 UTC 时区偏差 */
const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function makeEmptyInvoice(type: ReimbursementType): InvoiceSection {
  return {
    buyer_name: '', buyer_tax_id: '', buyer_name_valid: false, buyer_tax_id_valid: false,
    invoice_date: '', invoice_total: 0, reimbursement_amount: 0, handler: '', reimb_type: type,
    is_public_transfer: false,
    items: [{ name: '', unit_price: 0, quantity: 1, amount: 0, purchase_channel: '网购', reusable: '否', source_invoice_item: false }],
  };
}

const emptyForm: ReimbursementFormData = {
  types: [],
  activity_name: '', org_name: '', activity_end_date: todayStr(),
  reimbursement_date: todayStr(),
  invoices: [], actual_total: 0,
  finance_officer: '', activity_leader_opinion: '同意', alipay_account: '',
};

/** 单种材料的向导状态：新上传文件 + 重编辑场景下的原有文件 */
export interface MaterialEntry { files: File[]; existingUrls: string[]; existingPaths: string[]; }
/** 多类型材料状态：{类型: {材料key: 状态}} */
export type TypeMaterialsState = Partial<Record<ReimbursementType, Partial<Record<MaterialKey, MaterialEntry>>>>;

export const emptyMaterialEntry = (): MaterialEntry => ({ files: [], existingUrls: [], existingPaths: [] });
const emptyMaterials = (): TypeMaterialsState => ({});

function loadAuth(): { token: string; user: any } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAuth(token: string, user: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useFeedback();
  const [auth, setAuth] = useState<{ token: string; user: any } | null>(loadAuth);

  // ---- OCR / Form state (shared across wizard steps) ----
  const [ocrResults, setOcrResults] = useState<Partial<Record<ReimbursementType, OCRResult[]>>>({});
  const [formData, setFormData] = useState<ReimbursementFormData>(emptyForm);
  const [materials, setMaterials] = useState<TypeMaterialsState>(emptyMaterials);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ message: string; zip_filename: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    // 每次新申请都刷新当天日期（跨天后不陈旧）
    setFormData({ ...emptyForm, activity_end_date: todayStr(), reimbursement_date: todayStr() });
    setOcrResults({}); setMaterials(emptyMaterials());
    setSubmitResult(null); setDraftId(null);
  }, []);

  const setMaterialFiles = useCallback((type: ReimbursementType, key: MaterialKey, files: File[]) => {
    setMaterials(p => ({ ...p, [type]: { ...p[type], [key]: { ...emptyMaterialEntry(), ...p[type]?.[key], files } } }));
  }, []);

  const setOcrResultsByType = useCallback((type: ReimbursementType, results: OCRResult[]) => {
    setOcrResults(p => ({ ...p, [type]: results }));
  }, []);

  const clearMaterialExisting = useCallback((type: ReimbursementType, key: MaterialKey) => {
    setMaterials(p => ({ ...p, [type]: { ...p[type], [key]: { ...emptyMaterialEntry(), ...p[type]?.[key], existingUrls: [], existingPaths: [] } } }));
  }, []);

  const handleLogin = useCallback((token: string, user: any) => {
    saveAuth(token, user);
    setAuth({ token, user });

    if (user.can_choose_role) {
      navigate('/select-role');
    } else if (user.is_admin) {
      navigate('/admin');
    } else if (user.is_reviewer) {
      navigate('/reviewer');
    } else {
      navigate('/member');
    }
  }, [navigate]);

  const handleLogout = () => {
    clearAuth();
    setAuth(null);
    resetAll();
    navigate('/login');
  };

  const saveDraft = useCallback(async () => {
    try {
      const step = location.pathname.includes('fill') ? 2 : location.pathname.includes('review') ? 3 : 1;
      const payload = { draft_id: draftId, activity_name: formData.activity_name, org_name: formData.org_name, current_step: step, form_data: formData, ocr_results: ocrResults, user_email: auth?.user?.email || '' };
      const r = await fetch('/api/v1/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j.success) setDraftId(j.draft_id);
      return j.success;
    } catch { return false; }
  }, [formData, ocrResults, draftId, auth, location.pathname]);

  const restoreDraft = useCallback((draft: any) => {
    // 旧草稿迁移：type → types 数组；发票补类型标签；OCR 结果按类型打包
    const raw: any = { ...(draft.form_data || emptyForm) };
    const types: ReimbursementType[] = (raw.types?.length ? raw.types : (raw.type ? [raw.type] : ['vat']))
      .filter((t: string) => ['vat', 'insurance', 'travel', 'bulk', 'large'].includes(t)) as ReimbursementType[];
    const invoices: InvoiceSection[] = (raw.invoices || []).map((inv: any) => ({ ...inv, reimb_type: inv.reimb_type || types[0] }));
    setFormData({ ...emptyForm, ...raw, types, invoices });
    const ocr: any = draft.ocr_results || {};
    setOcrResults(Array.isArray(ocr) ? { [types[0]]: ocr } : ocr);
    setMaterials(emptyMaterials());
    setDraftId(draft.id); setSubmitResult(null);
    const step = draft.current_step || 1;
    navigate(step === 1 ? '/member/upload' : step === 2 ? '/member/fill' : '/member/review');
  }, [navigate]);

  useEffect(() => {
    const handler = (e: Event) => restoreDraft((e as CustomEvent).detail);
    window.addEventListener('restore-draft', handler);
    return () => window.removeEventListener('restore-draft', handler);
  }, [restoreDraft]);

  const promptSaveBeforeHome = useCallback(async () => {
    if (formData.activity_name || formData.org_name) {
      if (await confirm({ message: '是否将当前进度保存为草稿？\n\n[确定] = 保存\n[取消] = 不保存' })) await saveDraft();
    }
    navigate('/member');
  }, [formData, saveDraft, navigate, confirm]);

  const updateForm = (patch: Partial<ReimbursementFormData>) => setFormData(p => ({ ...p, ...patch }));
  const updateInvoice = (invIndex: number, patch: Partial<InvoiceSection>) => {
    setFormData(p => {
      const invoices = [...p.invoices]; invoices[invIndex] = { ...invoices[invIndex], ...patch };
      let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
      return { ...p, invoices, actual_total: total };
    });
  };
  const updateInvoiceItems = (invIndex: number, items: DetailRow[]) => {
    setFormData(p => {
      const invoices = [...p.invoices];
      const inv = invoices[invIndex];
      // 明细行变化时，报销金额自动同步为该发票实际花销（Σ单价×数量）；
      // 仅当报销金额仍为默认值（0 / 发票总额 / 旧明细合计）才跟随，用户手动改过的值不动
      const oldSubtotal = inv.items.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 0), 0);
      const newSubtotal = items.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 0), 0);
      const untouched = inv.reimbursement_amount === 0 || inv.reimbursement_amount === inv.invoice_total || inv.reimbursement_amount === oldSubtotal;
      invoices[invIndex] = { ...inv, items, reimbursement_amount: untouched ? newSubtotal : inv.reimbursement_amount };
      let total = 0; for (const inv2 of invoices) total += inv2.reimbursement_amount || 0;
      return { ...p, invoices, actual_total: total };
    });
  };
  const addInvoice = useCallback((type: ReimbursementType) => {
    setFormData(p => ({ ...p, invoices: [...p.invoices, makeEmptyInvoice(type)] }));
  }, []);
  const removeInvoice = useCallback((invIndex: number) => {
    setFormData(p => {
      const invoices = p.invoices.filter((_, i) => i !== invIndex);
      let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
      return { ...p, invoices, actual_total: total };
    });
  }, []);
  // OCR 结果只替换所属类型的发票区块，其他类型的发票保留
  const applyOCRResults = useCallback((type: ReimbursementType, results: OCRResult[]) => {
    if (!results.length) return;
    const sections: InvoiceSection[] = results.map(r => ({
      buyer_name: r.buyer_name, buyer_tax_id: r.buyer_tax_id, buyer_name_valid: r.buyer_name_valid, buyer_tax_id_valid: r.buyer_tax_id_valid,
      invoice_date: r.invoice_date, invoice_total: r.invoice_total, reimbursement_amount: r.invoice_total, handler: '', reimb_type: type,
      is_public_transfer: false,
      items: r.items.length ? r.items.map(item => ({ name: item.name, unit_price: item.unit_price, quantity: item.quantity, amount: item.amount, purchase_channel: '网购', reusable: '否', source_invoice_item: true }))
        : [{ name: '', unit_price: 0, quantity: 1, amount: 0, purchase_channel: '网购', reusable: '否', source_invoice_item: false }],
    }));
    setFormData(p => {
      const invoices = p.invoices.filter(inv => inv.reimb_type !== type);
      const firstIdx = p.invoices.findIndex(inv => inv.reimb_type === type);
      if (firstIdx >= 0) invoices.splice(firstIdx, 0, ...sections); else invoices.push(...sections);
      let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
      return { ...p, invoices, actual_total: total };
    });
  }, []);

  // 进入报销向导（类型在 step1 标签页中选择）
  const enterWizard = useCallback(() => {
    resetAll();
    navigate('/member/upload');
  }, [resetAll, navigate]);

  // 打回重编辑：恢复表单、原有材料文件与来源 ZIP（重审标记用）
  const handleReEdit = useCallback((data: any) => {
    const raw: any = { ...(data.form_data || data) };
    const types: ReimbursementType[] = (raw.types?.length ? raw.types : (raw.type ? [raw.type] : ['vat']))
      .filter((t: string) => ['vat', 'insurance', 'travel', 'bulk', 'large'].includes(t)) as ReimbursementType[];
    const invoices: InvoiceSection[] = (raw.invoices || []).map((inv: any) => ({ ...inv, reimb_type: inv.reimb_type || types[0] }));
    const restored = { ...emptyForm, ...raw, types, invoices };
    setFormData({ ...restored, previous_zip: data._previousZip || restored.previous_zip || '' });
    setSubmitResult(null); setOcrResults({});
    const existing = data._materials || {};
    setMaterials(p => {
      const next: TypeMaterialsState = { ...p };
      (Object.keys(existing) as string[]).forEach(k => {
        // 多类型数据键为 "type:key"；旧单类型为裸材料 key（归入第一个类型）
        const e = existing[k];
        const [t, key] = (k.includes(':') ? k.split(':') : [types[0], k]) as [ReimbursementType, MaterialKey];
        if (e) next[t] = { ...next[t], [key]: { ...emptyMaterialEntry(), ...next[t]?.[key], existingUrls: e.urls || [], existingPaths: e.paths || [] } };
      });
      return next;
    });
    navigate(data._reEditStep === 1 ? '/member/upload' : '/member/fill');
  }, [navigate]);

  // step1 → step2：确定本次申请包含的类型（有上传材料或手工发票区块的类型）
  const finalizeTypes = useCallback(() => {
    const active = SELECTABLE_TYPES.filter(t => {
      const tmat = materials[t] || {};
      const hasFiles = Object.values(tmat).some(e => (e?.files.length || 0) + (e?.existingUrls.length || 0) + (e?.existingPaths.length || 0) > 0);
      const hasInvoices = formData.invoices.some(i => i.reimb_type === t);
      return hasFiles || hasInvoices;
    });
    setFormData(p => ({ ...p, types: active }));
    navigate('/member/fill');
  }, [materials, formData.invoices, navigate]);

  const wizardProps = {
    materials, setMaterialFiles, clearMaterialExisting,
    ocrResults, setOcrResults: setOcrResultsByType, ocrLoading, setOcrLoading, applyOCRResults,
    onAddManualInvoice: addInvoice,
    invoiceSectionCounts: Object.fromEntries(SELECTABLE_TYPES.map(t => [t, formData.invoices.filter(i => i.reimb_type === t).length])) as Partial<Record<ReimbursementType, number>>,
    onNext: finalizeTypes,
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/select-role" element={auth?.user?.can_choose_role ? <RoleSelectPage user={auth.user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/member" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><HomePage onEnterWizard={enterWizard} onOpenDrafts={() => {}} onOpenHistory={() => {}} user={auth.user} onReEdit={handleReEdit} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/appeals" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><MemberAppeals user={auth.user} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/history" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><MemberHistory user={auth.user} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/feedback" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><MemberFeedback user={auth.user} onReEdit={handleReEdit} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/upload" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><UploadMaterials {...wizardProps} onHome={promptSaveBeforeHome} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/fill" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><FillForm formData={formData} updateForm={updateForm} updateInvoice={updateInvoice} updateInvoiceItems={updateInvoiceItems} userEmail={auth?.user?.email || ''} onAddInvoice={addInvoice} onRemoveInvoice={removeInvoice} onBack={() => navigate('/member/upload')} onNext={() => navigate('/member/review')} onSaveDraft={saveDraft} onHome={promptSaveBeforeHome} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/review" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><ReviewSubmit formData={formData} materials={materials} userEmail={auth?.user?.email || ''} submitResult={submitResult} setSubmitResult={setSubmitResult} onBack={() => navigate('/member/fill')} onSaveDraft={saveDraft} onHome={promptSaveBeforeHome} onReset={() => { resetAll(); navigate('/member'); }} /></div></> : <Navigate to="/login" />} />
      <Route path="/member/guide" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><GuidePage /></div></> : <Navigate to="/login" />} />
      <Route path="/reviewer" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><ReviewerDashboard user={auth.user} /></div></> : <Navigate to="/login" />} />
      <Route path="/reviewer/guide" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><GuidePage /></div></> : <Navigate to="/login" />} />
      <Route path="/reviewer/materials" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><ReviewMaterials user={auth.user} /></div></> : <Navigate to="/login" />} />
      <Route path="/reviewer/history" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><ReviewerHistory /></div></> : <Navigate to="/login" />} />

      <Route path="/admin" element={auth?.user?.is_admin ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><AdminDashboard user={auth.user} /></div></> : <Navigate to="/login" />} />
      <Route path="/admin/permissions" element={auth?.user?.is_admin ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><AdminPermissions /></div></> : <Navigate to="/login" />} />
      <Route path="/admin/appeals" element={auth?.user?.is_admin ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><AdminAppeals user={auth.user} /></div></> : <Navigate to="/login" />} />
      <Route path="/admin/guide" element={auth?.user?.is_admin ? <><TopNav user={auth?.user} onLogout={handleLogout} /><div className="page"><GuidePage /></div></> : <Navigate to="/login" />} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
