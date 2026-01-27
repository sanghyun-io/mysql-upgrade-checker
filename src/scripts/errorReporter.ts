/**
 * MySQL 8.0 → 8.4 Upgrade Checker - Error Reporting System
 * Provides GitHub Issue and Email reporting capabilities
 */

export interface ErrorContext {
  errorType: string;
  errorMessage: string;
  additionalInfo?: Record<string, unknown>;
}

export interface ErrorReport {
  errorType: string;
  errorMessage: string;
  timestamp: string;
  browser: {
    name: string;
    version: string;
  };
  os: string;
  url: string;
  additionalInfo?: Record<string, unknown>;
}

const GITHUB_REPO = 'sanghyun-io/mysql-upgrade-checker';
const EMAIL_ADDRESS = 'ppkimsanh@gmail.com';

export class ErrorReporter {
  private modalElement: HTMLElement | null = null;

  /**
   * Collect error context information automatically
   */
  collectErrorContext(
    errorType: string,
    errorMessage: string,
    additionalInfo?: Record<string, unknown>
  ): ErrorReport {
    const browserInfo = this.getBrowserInfo();
    const osInfo = this.getOSInfo();

    return {
      errorType,
      errorMessage,
      timestamp: new Date().toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      browser: browserInfo,
      os: osInfo,
      url: window.location.href,
      additionalInfo
    };
  }

  /**
   * Generate GitHub Issue template markdown
   */
  generateGitHubIssueTemplate(report: ErrorReport): string {
    const additionalInfoSection = report.additionalInfo
      ? Object.entries(report.additionalInfo)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n')
      : '(없음)';

    return `## 에러 보고

### 환경 정보
- **브라우저**: ${report.browser.name} ${report.browser.version}
- **OS**: ${report.os}
- **발생 시간**: ${report.timestamp}

### 에러 내용
- **에러 유형**: ${report.errorType}
- **에러 메시지**: ${report.errorMessage}

### 추가 정보
${additionalInfoSection}

### 재현 방법
(에러 발생 전 수행한 작업을 설명해주세요)

### 기대 동작
(어떻게 동작해야 한다고 생각하시나요?)
`;
  }

  /**
   * Get GitHub new issue URL with pre-filled content
   */
  getGitHubIssueUrl(report: ErrorReport): string {
    const title = encodeURIComponent(`[Bug] ${report.errorType}`);
    const body = encodeURIComponent(this.generateGitHubIssueTemplate(report));
    const labels = encodeURIComponent('bug');

    return `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${body}&labels=${labels}`;
  }

  /**
   * Generate Email template
   */
  generateEmailTemplate(report: ErrorReport): string {
    return this.generateGitHubIssueTemplate(report);
  }

  /**
   * Get mailto URL with pre-filled content
   */
  getMailtoUrl(report: ErrorReport): string {
    const subject = encodeURIComponent(`[MySQL Upgrade Checker] 에러 보고 - ${report.errorType}`);
    const body = encodeURIComponent(this.generateEmailTemplate(report));

    return `mailto:${EMAIL_ADDRESS}?subject=${subject}&body=${body}`;
  }

  /**
   * Show the error reporting modal
   */
  showReportModal(report: ErrorReport): void {
    this.hideReportModal();

    const template = this.generateGitHubIssueTemplate(report);
    const githubUrl = this.getGitHubIssueUrl(report);
    const mailtoUrl = this.getMailtoUrl(report);

    const modal = document.createElement('div');
    modal.id = 'error-report-modal';
    modal.className = 'error-report-modal-overlay';
    modal.innerHTML = `
      <div class="error-report-modal">
        <div class="error-report-modal-header">
          <h3>문제 신고</h3>
          <button class="error-report-modal-close" aria-label="닫기">×</button>
        </div>
        <div class="error-report-modal-body">
          <p class="error-report-modal-desc">
            아래 두 가지 방법 중 하나를 선택하여 문제를 신고해주세요.
          </p>

          <div class="error-report-section">
            <div class="error-report-section-header">
              <span class="error-report-section-icon">🐙</span>
              <span class="error-report-section-title">GitHub Issue</span>
            </div>
            <div class="error-report-template-container">
              <pre class="error-report-template">${this.escapeHtml(template)}</pre>
              <button class="error-report-copy-btn" data-copy="github">
                📋 템플릿 복사
              </button>
            </div>
            <a href="${githubUrl}" target="_blank" class="error-report-action-btn github">
              Issue 발행하기 →
            </a>
          </div>

          <div class="error-report-section">
            <div class="error-report-section-header">
              <span class="error-report-section-icon">📧</span>
              <span class="error-report-section-title">Email</span>
            </div>
            <div class="error-report-template-container">
              <pre class="error-report-template">${this.escapeHtml(template)}</pre>
              <button class="error-report-copy-btn" data-copy="email">
                📋 템플릿 복사
              </button>
            </div>
            <a href="${mailtoUrl}" class="error-report-action-btn email">
              Email 보내기 →
            </a>
          </div>
        </div>
      </div>
    `;

    // Event handlers
    const closeBtn = modal.querySelector('.error-report-modal-close') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => this.hideReportModal());

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideReportModal();
      }
    });

    // Copy buttons
    const copyBtns = modal.querySelectorAll('.error-report-copy-btn');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.copyToClipboard(template, btn as HTMLButtonElement);
      });
    });

    // ESC key to close
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hideReportModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    document.body.appendChild(modal);
    this.modalElement = modal;

    // Trigger animation
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  }

  /**
   * Hide the error reporting modal
   */
  hideReportModal(): void {
    if (this.modalElement) {
      this.modalElement.classList.remove('visible');
      setTimeout(() => {
        this.modalElement?.remove();
        this.modalElement = null;
      }, 300);
    }
  }

  /**
   * Copy text to clipboard with visual feedback
   */
  private async copyToClipboard(text: string, button: HTMLButtonElement): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      const originalText = button.textContent;
      button.textContent = '✓ 복사됨';
      button.classList.add('copied');

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
    }
  }

  /**
   * Get browser name and version
   */
  private getBrowserInfo(): { name: string; version: string } {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = 'Unknown';

    if (ua.includes('Firefox/')) {
      name = 'Firefox';
      version = ua.match(/Firefox\/([\d.]+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Edg/')) {
      name = 'Edge';
      version = ua.match(/Edg\/([\d.]+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Chrome/')) {
      name = 'Chrome';
      version = ua.match(/Chrome\/([\d.]+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      name = 'Safari';
      version = ua.match(/Version\/([\d.]+)/)?.[1] || 'Unknown';
    }

    return { name, version };
  }

  /**
   * Get OS information
   */
  private getOSInfo(): string {
    const ua = navigator.userAgent;

    if (ua.includes('Windows NT 10')) return 'Windows 10/11';
    if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
    if (ua.includes('Windows NT 6.2')) return 'Windows 8';
    if (ua.includes('Windows NT 6.1')) return 'Windows 7';
    if (ua.includes('Mac OS X')) {
      const match = ua.match(/Mac OS X ([\d_]+)/);
      if (match) {
        return `macOS ${match[1].replace(/_/g, '.')}`;
      }
      return 'macOS';
    }
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';

    return 'Unknown';
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
