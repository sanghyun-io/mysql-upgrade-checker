/**
 * MySQL 8.0 → 8.4 Upgrade Checker - Toast Notification System
 * Non-intrusive toast notifications with error reporting capability
 */

import { ErrorReporter, type ErrorContext } from './errorReporter';

export type ToastSeverity = 'success' | 'warning' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  severity: ToastSeverity;
  duration?: number;
  showReportButton?: boolean;
  errorContext?: ErrorContext;
}

interface ToastElement {
  id: string;
  element: HTMLElement;
  timeout?: number;
}

const SEVERITY_CONFIG: Record<ToastSeverity, { icon: string; defaultDuration: number }> = {
  success: { icon: '✅', defaultDuration: 3000 },
  warning: { icon: '⚠️', defaultDuration: 4000 },
  error: { icon: '❌', defaultDuration: 5000 },
  info: { icon: 'ℹ️', defaultDuration: 3000 }
};

class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: Map<string, ToastElement> = new Map();
  private errorReporter: ErrorReporter;
  private idCounter = 0;

  constructor() {
    this.errorReporter = new ErrorReporter();
    this.ensureContainer();
  }

  private ensureContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  show(options: ToastOptions): string {
    const container = this.ensureContainer();
    const id = `toast-${++this.idCounter}`;
    const config = SEVERITY_CONFIG[options.severity];
    const duration = options.duration ?? config.defaultDuration;
    const showReportButton = options.showReportButton ?? (options.severity === 'error');

    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `toast toast-${options.severity}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    toast.innerHTML = `
      <div class="toast-icon">${config.icon}</div>
      <div class="toast-content">
        <div class="toast-message">${this.escapeHtml(options.message)}</div>
        ${showReportButton ? `
          <button class="toast-report-btn" data-toast-id="${id}">
            문제 신고
          </button>
        ` : ''}
      </div>
      <button class="toast-close" data-toast-id="${id}" aria-label="닫기">×</button>
    `;

    // Add event listeners
    const closeBtn = toast.querySelector('.toast-close') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => this.dismiss(id));

    const reportBtn = toast.querySelector('.toast-report-btn') as HTMLButtonElement;
    if (reportBtn && options.errorContext) {
      reportBtn.addEventListener('click', () => {
        const report = this.errorReporter.collectErrorContext(
          options.errorContext!.errorType,
          options.errorContext!.errorMessage,
          options.errorContext!.additionalInfo
        );
        this.errorReporter.showReportModal(report);
      });
    }

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    // Set auto-dismiss timeout
    const timeout = window.setTimeout(() => {
      this.dismiss(id);
    }, duration);

    this.toasts.set(id, { id, element: toast, timeout });

    return id;
  }

  dismiss(toastId: string): void {
    const toastData = this.toasts.get(toastId);
    if (!toastData) return;

    const { element, timeout } = toastData;

    // Clear timeout
    if (timeout) {
      clearTimeout(timeout);
    }

    // Trigger exit animation
    element.classList.remove('toast-visible');
    element.classList.add('toast-hiding');

    // Remove after animation
    setTimeout(() => {
      element.remove();
      this.toasts.delete(toastId);
    }, 300);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Singleton instance
const toastManager = new ToastManager();

// Convenience functions
export function showSuccess(message: string): string {
  return toastManager.show({ message, severity: 'success' });
}

export function showWarning(message: string): string {
  return toastManager.show({ message, severity: 'warning' });
}

export function showError(message: string, errorContext?: ErrorContext): string {
  return toastManager.show({
    message,
    severity: 'error',
    showReportButton: true,
    errorContext: errorContext || {
      errorType: 'UNKNOWN_ERROR',
      errorMessage: message
    }
  });
}

export function showInfo(message: string): string {
  return toastManager.show({ message, severity: 'info' });
}

export { toastManager };
