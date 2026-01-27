/**
 * MySQL 8.0 → 8.4 Upgrade Checker - UI Manager
 * Handles result display with category grouping
 */

import type { AnalysisResults, Issue, RuleCategory, GroupedIssues } from './types';
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_ORDER } from './types';
import { TOTAL_RULE_COUNT } from './rules';

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
    // Update statistics
    document.getElementById('safeCount')!.textContent =
      results.issues.length === 0 ? '✓' : '—';
    document.getElementById('errorCount')!.textContent = String(results.stats.error || 0);
    document.getElementById('warningCount')!.textContent = String(results.stats.warning || 0);
    document.getElementById('infoCount')!.textContent = String(results.stats.info || 0);

    // Display issues
    if (results.issues.length === 0) {
      this.issuesContainer.innerHTML = this.renderNoIssues();
    } else {
      // Group issues by category
      const groupedIssues = this.groupIssuesByCategory(results.issues);
      this.issuesContainer.innerHTML = this.renderGroupedIssues(groupedIssues, results);
    }

    this.resultsSection.classList.add('show');
    this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private renderNoIssues(): string {
    return `
      <div class="no-issues">
        <div class="no-issues-icon">✅</div>
        <h3>호환성 문제가 발견되지 않았습니다!</h3>
        <p>분석한 덤프 파일은 MySQL 8.4로 업그레이드하는데 문제가 없어 보입니다.</p>
        <p style="margin-top: 12px; font-size: 14px;">
          (${TOTAL_RULE_COUNT}개의 호환성 규칙을 검사했으며, 실제 환경에서 추가 테스트를 권장합니다)
        </p>
      </div>
    `;
  }

  private groupIssuesByCategory(issues: Issue[]): GroupedIssues[] {
    const groups: Map<RuleCategory, Issue[]> = new Map();

    // Initialize all categories
    for (const category of CATEGORY_ORDER) {
      groups.set(category, []);
    }

    // Group issues
    for (const issue of issues) {
      const category = issue.category || 'invalidObjects';
      const categoryIssues = groups.get(category) || [];
      categoryIssues.push(issue);
      groups.set(category, categoryIssues);
    }

    // Convert to GroupedIssues array, only including non-empty categories
    const result: GroupedIssues[] = [];
    for (const category of CATEGORY_ORDER) {
      const categoryIssues = groups.get(category) || [];
      if (categoryIssues.length > 0) {
        // Sort by severity within category
        const sortedIssues = [...categoryIssues].sort((a, b) => {
          const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        });

        result.push({
          category,
          label: CATEGORY_LABELS[category],
          description: CATEGORY_DESCRIPTIONS[category],
          issues: sortedIssues,
          errorCount: sortedIssues.filter(i => i.severity === 'error').length,
          warningCount: sortedIssues.filter(i => i.severity === 'warning').length,
          infoCount: sortedIssues.filter(i => i.severity === 'info').length
        });
      }
    }

    return result;
  }

  private renderGroupedIssues(groups: GroupedIssues[], results: AnalysisResults): string {
    // Summary header
    const summary = `
      <div class="results-summary">
        <h3>분석 결과 요약</h3>
        <p>총 ${results.issues.length}개의 호환성 문제가 ${groups.length}개 카테고리에서 발견되었습니다.</p>
        <p class="rule-count">(${TOTAL_RULE_COUNT}개 규칙 검사 완료)</p>
      </div>
    `;

    // Category navigation
    const categoryNav = `
      <div class="category-nav">
        ${groups.map(g => `
          <a href="#category-${g.category}" class="category-nav-item">
            <span class="category-nav-label">${g.label}</span>
            <span class="category-nav-count">
              ${g.errorCount > 0 ? `<span class="count-error">${g.errorCount}</span>` : ''}
              ${g.warningCount > 0 ? `<span class="count-warning">${g.warningCount}</span>` : ''}
              ${g.infoCount > 0 ? `<span class="count-info">${g.infoCount}</span>` : ''}
            </span>
          </a>
        `).join('')}
      </div>
    `;

    // Category sections
    const categorySections = groups.map(group => this.renderCategorySection(group)).join('');

    return summary + categoryNav + categorySections;
  }

  private renderCategorySection(group: GroupedIssues): string {
    return `
      <div class="category-section" id="category-${group.category}">
        <div class="category-header">
          <h3 class="category-title">${group.label}</h3>
          <div class="category-counts">
            ${group.errorCount > 0 ? `<span class="count-badge error">${group.errorCount} 오류</span>` : ''}
            ${group.warningCount > 0 ? `<span class="count-badge warning">${group.warningCount} 경고</span>` : ''}
            ${group.infoCount > 0 ? `<span class="count-badge info">${group.infoCount} 정보</span>` : ''}
          </div>
        </div>
        <p class="category-description">${group.description}</p>
        <div class="category-issues">
          ${group.issues.map(issue => this.renderIssue(issue)).join('')}
        </div>
      </div>
    `;
  }

  private renderIssue(issue: Issue): string {
    const severityLabel =
      issue.severity === 'error'
        ? '🚫 ERROR'
        : issue.severity === 'warning'
        ? '⚠️ WARNING'
        : 'ℹ️ INFO';

    const docLinkHtml = issue.docLink
      ? `<a href="${issue.docLink}" target="_blank" class="doc-link" title="MySQL 공식 문서">📖 문서</a>`
      : '';

    return `
      <div class="issue-card ${issue.severity}">
        <div class="issue-header">
          <span class="issue-badge ${issue.severity}">${severityLabel}</span>
          <div class="issue-title">${issue.title}</div>
          ${docLinkHtml}
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
