import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoleSelectPage from './pages/RoleSelectPage';
import TopNav from './components/TopNav';
import ReviewerDashboard from './pages/ReviewerDashboard';
import ReviewMaterials from './pages/ReviewMaterials';
import ManagePermissions from './pages/ManagePermissions';
import UploadMaterials from './pages/UploadMaterials';
import FillForm from './pages/FillForm';
import ReviewSubmit from './pages/ReviewSubmit';
import HomePage from './pages/HomePage';
import TypeSelectPage from './pages/TypeSelectPage';
import { OCRResult, ReimbursementFormData, InvoiceSection, DetailRow, ReimbursementType, MaterialKey } from './types';
import { MATERIALS } from './config/materials';

const STORAGE_KEY = 'reimbursement_auth';

/** 本地时区的今天（YYYY-MM-DD），避免 toISOString 的 UTC 时区偏差 */
const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function makeEmptyInvoice(): InvoiceSection {
  return {
    buyer_name: '', buyer_tax_id: '', buyer_name_valid: false, buyer_tax_id_valid: false,
    invoice_date: '', invoice_total: 0, reimbursement_amount: 0, handler: '',
    items: [{ name: '', unit_price: 0, quantity: 1, amount: 0, purchase_channel: '网购', reusable: '否', source_invoice_item: false }],
  };
}

const emptyForm: ReimbursementFormData = {
  type: 'vat',
  activity_name: '', org_name: '', activity_end_date: todayStr(),
  reimbursement_date: todayStr(),
  invoices: [], actual_total: 0,
  finance_officer: '', activity_leader_opinion: '', alipay_account: '',
};

/** 单种材料的向导状态：新上传文件 + 重编辑场景下的原有文件 */
export interface MaterialEntry { files: File[]; existingUrls: string[]; existingPaths: string[]; }
export type MaterialFilesState = Record<MaterialKey, MaterialEntry>;

const emptyMaterials = (): MaterialFilesState => {
  const entries = {} as MaterialFilesState;
  (Object.keys(MATERIALS) as MaterialKey[]).forEach(k => { entries[k] = { files: [], existingUrls: [], existingPaths: [] }; });
  return entries;
};

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
  const [auth, setAuth] = useState<{ token: string; user: any } | null>(loadAuth);

  // ---- OCR / Form state (shared across wizard steps) ----
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [formData, setFormData] = useState<ReimbursementFormData>(emptyForm);
  const [materials, setMaterials] = useState<MaterialFilesState>(emptyMaterials);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ message: string; zip_filename: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const resetAll = useCallback((type: ReimbursementType = 'vat') => {
    // 每次新申请都刷新当天日期（跨天后不陈旧）
    setFormData({ ...emptyForm, type, activity_end_date: todayStr(), reimbursement_date: todayStr() });
    setOcrResults([]); setMaterials(emptyMaterials());
    setSubmitResult(null); setDraftId(null);
  }, []);

  const setMaterialFiles = useCallback((key: MaterialKey, files: File[]) => {
    setMaterials(p => ({ ...p, [key]: { ...p[key], files } }));
  }, []);

  const clearMaterialExisting = useCallback((key: MaterialKey) => {
    setMaterials(p => ({ ...p, [key]: { ...p[key], existingUrls: [], existingPaths: [] } }));
  }, []);

  const handleLogin = useCallback((token: string, user: any) => {
    saveAuth(token, user);
    setAuth({ token, user });

    if (user.can_choose_role) {
      navigate('/select-role');
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
    // 旧草稿无 type 时兜底 vat
    setFormData({ ...emptyForm, ...(draft.form_data || emptyForm) }); setOcrResults(draft.ocr_results || []);
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
      if (window.confirm('是否将当前进度保存为草稿？\n\n[确定] = 保存\n[取消] = 不保存')) await saveDraft();
    }
    navigate('/member');
  }, [formData, saveDraft, navigate]);

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
      const invoices = [...p.invoices]; invoices[invIndex] = { ...invoices[invIndex], items };
      let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
      return { ...p, invoices, actual_total: total };
    });
  };
  const addInvoice = useCallback(() => {
    setFormData(p => ({ ...p, invoices: [...p.invoices, makeEmptyInvoice()] }));
  }, []);
  const removeInvoice = useCallback((invIndex: number) => {
    setFormData(p => {
      const invoices = p.invoices.filter((_, i) => i !== invIndex);
      let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
      return { ...p, invoices, actual_total: total };
    });
  }, []);
  const applyOCRResults = useCallback((results: OCRResult[]) => {
    if (!results.length) return;
    const invoices: InvoiceSection[] = results.map(r => ({
      buyer_name: r.buyer_name, buyer_tax_id: r.buyer_tax_id, buyer_name_valid: r.buyer_name_valid, buyer_tax_id_valid: r.buyer_tax_id_valid,
      invoice_date: r.invoice_date, invoice_total: r.invoice_total, reimbursement_amount: 0, handler: '',
      items: r.items.length ? r.items.map(item => ({ name: item.name, unit_price: item.unit_price, quantity: item.quantity, amount: item.amount, purchase_channel: '网购', reusable: '否', source_invoice_item: true }))
        : [{ name: '', unit_price: 0, quantity: 1, amount: 0, purchase_channel: '网购', reusable: '否', source_invoice_item: false }],
    }));
    let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
    setFormData(p => ({ ...p, invoices, actual_total: total }));
  }, []);

  const enterType = useCallback((type: ReimbursementType) => {
    resetAll(type);
    navigate('/member/upload');
  }, [resetAll, navigate]);

  // 打回重编辑：恢复表单、原有材料文件与来源 ZIP（重审标记用）
  const handleReEdit = useCallback((data: any) => {
    const restored = { ...emptyForm, ...(data.form_data || data) };
    setFormData({ ...restored, previous_zip: data._previousZip || restored.previous_zip || '' });
    setSubmitResult(null);
    const existing = data._materials || {};
    setMaterials(p => {
      const next = { ...p };
      (Object.keys(next) as MaterialKey[]).forEach(k => {
        const e = existing[k];
        if (e) next[k] = { ...next[k], existingUrls: e.urls || [], existingPaths: e.paths || [] };
      });
      return next;
    });
    navigate(data._reEditStep === 1 ? '/member/upload' : '/member/fill');
  }, [navigate]);

  const wizardProps = {
    reimbType: formData.type,
    materials, setMaterialFiles, clearMaterialExisting,
    ocrResults, setOcrResults, ocrLoading, setOcrLoading, applyOCRResults,
    onAddManualInvoice: addInvoice,
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/select-role" element={auth?.user?.can_choose_role ? <RoleSelectPage user={auth.user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/member" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><HomePage onEnterVat={() => enterType('vat')} onEnterOther={() => navigate('/member/type-select')} onOpenDrafts={() => {}} onOpenHistory={() => {}} user={auth.user} onApplyReviewer={() => navigate('/member/apply')} onReEdit={handleReEdit} /></> : <Navigate to="/login" />} />
      <Route path="/member/type-select" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><TypeSelectPage onEnterType={enterType} /></> : <Navigate to="/login" />} />
      <Route path="/member/upload" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><UploadMaterials {...wizardProps} invoiceSectionCount={formData.invoices.length} onNext={() => navigate('/member/fill')} onHome={promptSaveBeforeHome} /></> : <Navigate to="/login" />} />
      <Route path="/member/fill" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><FillForm formData={formData} updateForm={updateForm} updateInvoice={updateInvoice} updateInvoiceItems={updateInvoiceItems} onAddInvoice={addInvoice} onRemoveInvoice={removeInvoice} onBack={() => navigate('/member/upload')} onNext={() => navigate('/member/review')} onSaveDraft={saveDraft} onHome={promptSaveBeforeHome} /></> : <Navigate to="/login" />} />
      <Route path="/member/review" element={auth ? <><TopNav user={auth?.user} onLogout={handleLogout} /><ReviewSubmit formData={formData} materials={materials} userEmail={auth?.user?.email || ''} submitResult={submitResult} setSubmitResult={setSubmitResult} onBack={() => navigate('/member/fill')} onSaveDraft={saveDraft} onHome={promptSaveBeforeHome} onReset={() => { resetAll(); navigate('/member'); }} /></> : <Navigate to="/login" />} />
      <Route path="/reviewer" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><ReviewerDashboard user={auth.user} /></> : <Navigate to="/login" />} />
      <Route path="/reviewer/materials" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><ReviewMaterials user={auth.user} /></> : <Navigate to="/login" />} />
      <Route path="/reviewer/permissions" element={auth?.user?.is_reviewer ? <><TopNav user={auth?.user} onLogout={handleLogout} /><ManagePermissions /></> : <Navigate to="/login" />} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
