/**
 * 全局轻提示（Toast）与确认框（ConfirmDialog）。
 * 替换原生 alert()/confirm()：文案逐字保留，语义不变。
 * 用法：
 *   const { toast, confirm } = useFeedback();
 *   toast('申请已提交', 'success');
 *   const ok = await confirm({ message: '确定删除？', tone: 'danger' });
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

type ToastTone = 'success' | 'error' | 'warn' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  /** danger = 红色确定钮（删除类操作）；primary = 紫色确定钮（默认） */
  tone?: 'danger' | 'primary';
  confirmText?: string;
  cancelText?: string;
}

interface FeedbackContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback 必须在 FeedbackProvider 内使用');
  return ctx;
}

const TONE_ICON: Record<ToastTone, string> = {
  success: 'check-circle',
  error: 'alert-triangle',
  warn: 'alert-triangle',
  info: 'eye',
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      // 单实例防连击：已有确认框时立即取消
      setConfirmState(prev => {
        if (prev) {
          setTimeout(() => resolve(false), 0);
          return prev;
        }
        return { opts, resolve };
      });
    });
  }, []);

  const settleConfirm = useCallback((result: boolean) => {
    setConfirmState(prev => {
      if (prev) {
        setTimeout(() => prev.resolve(result), 0);
      }
      return null;
    });
  }, []);

  // Esc 关闭确认框
  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settleConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState, settleConfirm]);

  const tone = confirmState?.opts.tone || 'primary';

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast 层 */}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <Icon name={TONE_ICON[t.tone]} size={16} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* 确认框 */}
      {confirmState && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) settleConfirm(false);
          }}
        >
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={confirmState.opts.title || '请确认'}>
            <div className="modal-title" style={{ marginBottom: 12 }}>
              {confirmState.opts.title || '请确认'}
            </div>
            <div className="modal-body">{confirmState.opts.message}</div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" autoFocus onClick={() => settleConfirm(false)}>
                {confirmState.opts.cancelText || '取消'}
              </button>
              <button
                type="button"
                className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => settleConfirm(true)}
              >
                {confirmState.opts.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
