import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import RoleSelectPage from './pages/RoleSelectPage';
import ReviewerDashboard from './pages/ReviewerDashboard';
import ReviewMaterials from './pages/ReviewMaterials';
import ManagePermissions from './pages/ManagePermissions';
import UploadMaterials from './pages/UploadMaterials';
import FillForm from './pages/FillForm';
import ReviewSubmit from './pages/ReviewSubmit';
import { OCRResult, ReimbursementFormData, InvoiceSection, DetailRow } from './types';

const STORAGE_KEY = 'reimbursement_auth';

function makeEmptyInvoice(): InvoiceSection {
  return {
    buyer_name: '', buyer_tax_id: '', buyer_name_valid: false, buyer_tax_id_valid: false,
    invoice_date: '', invoice_total: 0, reimbursement_amount: 0, handler: '',
    items: [{ name: '', unit_price: 0, quantity: 1, amount: 0, purchase_channel: '', reusable: '', source_invoice_item: false }],
  };
}

const emptyForm: ReimbursementFormData = {
  activity_name: '', org_name: '', activity_end_date: '',
  reimbursement_date: new Date().toISOString().slice(0, 10),
  invoices: [makeEmptyInvoice()], actual_total: 0,
  finance_officer: '', activity_leader_opinion: '', alipay_account: '',
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
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ message: string; zip_filename: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [reEditInvoiceUrls, setReEditInvoiceUrls] = useState<string[]>([]);
  const [reEditEvidenceUrls, setReEditEvidenceUrls] = useState<string[]>([]);
  const [reEditInvoicePaths, setReEditInvoicePaths] = useState<string[]>([]);
  const [reEditEvidencePaths, setReEditEvidencePaths] = useState<string[]>([]);

  const resetAll = useCallback(() => {
    setFormData(emptyForm); setOcrResults([]); setInvoiceFiles([]);
    setEvidenceFiles([]); setSubmitResult(null); setDraftId(null);
    setReEditInvoiceUrls([]); setReEditEvidenceUrls([]);
    setReEditInvoicePaths([]); setReEditEvidencePaths([]);
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
    setFormData(draft.form_data || emptyForm); setOcrResults(draft.ocr_results || []);
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
  const applyOCRResults = useCallback((results: OCRResult[]) => {
    if (!results.length) return;
    const invoices: InvoiceSection[] = results.map(r => ({
      buyer_name: r.buyer_name, buyer_tax_id: r.buyer_tax_id, buyer_name_valid: r.buyer_name_valid, buyer_tax_id_valid: r.buyer_tax_id_valid,
      invoice_date: r.invoice_date, invoice_total: r.invoice_total, reimbursement_amount: 0, handler: '',
      items: r.items.length ? r.items.map(item => ({ name: item.name, unit_price: item.unit_price, quantity: item.quantity, amount: item.amount, purchase_channel: '', reusable: '', source_invoice_item: true }))
        : [{ name: '', unit_price: 0, quantity: 1, amount: 0, purchase_channel: '', reusable: '', source_invoice_item: false }],
    }));
    let total = 0; for (const inv of invoices) total += inv.reimbursement_amount || 0;
    setFormData(p => ({ ...p, invoices, actual_total: total }));
  }, []);

  const clearReEdit = () => { setReEditInvoiceUrls([]); setReEditEvidenceUrls([]); setReEditInvoicePaths([]); setReEditEvidencePaths([]); };
  const wizardProps = { invoiceFiles, setInvoiceFiles, evidenceFiles, setEvidenceFiles, ocrResults, setOcrResults, ocrLoading, setOcrLoading, applyOCRResults, reEditInvoiceUrls, reEditEvidenceUrls, onClearReEdit: clearReEdit };

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LoginPage onLogin={handleLogin} />} />
      <Route path="/select-role" element={auth?.user?.can_choose_role ? <RoleSelectPage user={auth.user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Member routes */}
      <Route path="/member" element={auth ? <HomePage onEnterVat={() => { resetAll(); navigate('/member/upload'); }} onOpenDrafts={() => {}} onOpenHistory={() => {}} user={auth.user} onApplyReviewer={() => navigate('/member/apply')}
        onReEdit={(data: any) => {
          setFormData(data.form_data || data);
          setSubmitResult(null);
          navigate('/member/fill');
        }} />
        : <Navigate to="/login" />} />
      <Route path="/member/upload" element={<UploadMaterials {...wizardProps} onNext={() => navigate('/member/fill')} onHome={promptSaveBeforeHome} />} />
      <Route path="/member/fill" element={<FillForm formData={formData} updateForm={updateForm} updateInvoice={updateInvoice} updateInvoiceItems={updateInvoiceItems} onBack={() => navigate('/member/upload')} onNext={() => navigate('/member/review')} onSaveDraft={saveDraft} onHome={promptSaveBeforeHome} />} />
      <Route path="/member/review" element={<ReviewSubmit formData={formData} invoiceFiles={invoiceFiles} evidenceFiles={evidenceFiles} reEditInvoicePaths={reEditInvoicePaths} reEditEvidencePaths={reEditEvidencePaths} reEditInvoiceUrls={reEditInvoiceUrls} reEditEvidenceUrls={reEditEvidenceUrls} userEmail={auth?.user?.email || ''} submitResult={submitResult} setSubmitResult={setSubmitResult} onBack={() => navigate('/member/fill')} onSaveDraft={saveDraft} onHome={promptSaveBeforeHome} onReset={() => { resetAll(); navigate('/member'); }} />} />

      {/* Reviewer routes */}
      <Route path="/reviewer" element={auth?.user?.is_reviewer ? <ReviewerDashboard user={auth.user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
      <Route path="/reviewer/materials" element={auth?.user?.is_reviewer ? <ReviewMaterials user={auth.user} /> : <Navigate to="/login" />} />
      <Route path="/reviewer/permissions" element={auth?.user?.is_reviewer ? <ManagePermissions /> : <Navigate to="/login" />} />

      {/* Default redirect */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
