import type { AnalysisResults, Issue } from './types';

export class UIManager {
  private progressSection: HTMLElement;
  private resultsSection: HTMLElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;
  private issuesContainer: HTMLElement;

  constructor() {
    this.progressSection = document.getElementById('progressSection')!;
    this.resultsSection = document.getElementById('resultsSection')!;
    this.progressBar = document.getElementById('progressBar')!;
    this.progressText = document.getElementById('progressText')!;
    this.issuesContainer = document.getElementById('issuesContainer')!;
  }

  showProgress(): void {
    this.progressSection.classList.add('show');
    this.resultsSection.classList.remove('show');
  }

  hideProgress(): void {
    this.progressSection.classList.remove('show');
  }

  updateProgress(current: number, total: number, fileName: string, fileType: string): void {
    const progress = (current / total) * 100;
    this.progressBar.style.width = progress + '%';
    this.progressText.textContent = `${fileName} ${
      fileType === 'skip' ? '건너뛰는 중' : '분석 중'
    }... (${current}/${total})`;
  }

  displayResults(results: AnalysisResults): void {
    // 통계 업데이트
    document.getElementById('safeCount')!.textContent =
      results.issues.length === 0 ? '✓' : '—';
    document.getElementById('errorCount')!.textContent = String(results.stats.error || 0);
    document.getElementById('warningCount')!.textContent = String(results.stats.warning || 0);
    document.getElementById('infoCount')!.textContent = String(results.stats.info || 0);

    // 이슈 표시
    if (results.issues.length === 0) {
      this.issuesContainer.innerHTML = `
        <div class="no-issues">
          <div class="no-issues-icon">✅</div>
          <h3>호환성 문제가 발견되지 않았습니다!</h3>
          <p>분석한 덤프 파일은 MySQL 8.4로 업그레이드하는데 문제가 없어 보입니다.</p>
          <p style="margin-top: 12px; font-size: 14px;">
            (주요 호환성 문제를 검사했으며, 실제 환경에서 추가 테스트를 권장합니다)
          </p>
        </div>
      `;
    } else {
      // 심각도별 정렬
      const sortedIssues = [...results.issues].sort((a, b) => {
        const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      this.issuesContainer.innerHTML = sortedIssues.map((issue) => this.renderIssue(issue)).join('');
    }

    this.resultsSection.classList.add('show');
    this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private renderIssue(issue: Issue): string {
    const severityLabel =
      issue.severity === 'error'
        ? '🚫 ERROR'
        : issue.severity === 'warning'
        ? '⚠️ WARNING'
        : 'ℹ️ INFO';

    return `
      <div class="issue-card ${issue.severity}">
        <div class="issue-header">
          <span class="issue-badge ${issue.severity}">${severityLabel}</span>
          <div class="issue-title">${issue.title}</div>
        </div>
        <div class="issue-description">${issue.description}</div>
        ${issue.location ? `<div class="issue-location">📍 위치: ${issue.location}</div>` : ''}
        ${issue.code ? `<div class="issue-code">${this.escapeHtml(issue.code)}</div>` : ''}
        ${
          issue.dataSample
            ? `
          <div class="data-sample">
            <div class="data-sample-title">데이터 샘플:</div>
            <div class="data-sample-content">${this.escapeHtml(
              issue.dataSample.substring(0, 200)
            )}...</div>
          </div>
        `
            : ''
        }
        <div class="issue-suggestion">
          <strong>💡 권장사항</strong>
          ${issue.suggestion}
        </div>
        ${
          issue.fixQuery
            ? `
          <div class="fix-query">
            <div class="fix-query-header">
              <strong>🔧 실행 가능한 수정 쿼리</strong>
              <button class="btn-copy" data-query="${this.escapeHtml(issue.fixQuery).replace(/"/g, '&quot;')}">
                📋 복사
              </button>
            </div>
            <pre class="fix-query-code">${this.escapeHtml(issue.fixQuery)}</pre>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export function copyToClipboard(text: string, button: HTMLButtonElement): void {
  if (!navigator.clipboard) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showCopySuccess(button);
    } catch (err) {
      console.error('복사 실패:', err);
      alert('클립보드 복사에 실패했습니다.');
    }
    document.body.removeChild(textArea);
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => {
      showCopySuccess(button);
    },
    (err) => {
      console.error('복사 실패:', err);
      alert('클립보드 복사에 실패했습니다.');
    }
  );
}

function showCopySuccess(button: HTMLButtonElement): void {
  const originalText = button.textContent;
  button.textContent = '✓ 복사됨';
  button.classList.add('copied');

  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('copied');
  }, 2000);
}
