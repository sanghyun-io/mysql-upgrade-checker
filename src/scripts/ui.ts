/**
 * MySQL 8.0 → 8.4 Upgrade Checker - UI Manager
 * Handles result display with category grouping and real-time streaming
 */

import type { AnalysisResults, Issue, RuleCategory, GroupedIssues, Severity } from './types';
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_ORDER } from './types';
import { TOTAL_RULE_COUNT } from './rules/index';
import { showError } from './toast';

// Severity order for sorting (error first, then warning, then info)
const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

// ============================================================================
// FILTER STATE
// ============================================================================
export interface FilterState {
  severity: 'all' | Severity;
  category: 'all' | RuleCategory;
  searchText: string;
}

export class UIManager {
  private progressSection: HTMLElement;
  private resultsSection: HTMLElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;
  private issuesContainer: HTMLElement;
  private filterSection: HTMLElement | null = null;

  // Streaming mode state
  private streamingMode: boolean = false;
  private currentIssues: Issue[] = [];
  private currentGroups: Map<RuleCategory, HTMLElement> = new Map();
  private categoryNav: HTMLElement | null = null;

  // Filter state
  private filterState: FilterState = {
    severity: 'all',
    category: 'all',
    searchText: ''
  };
  private allIssues: Issue[] = [];

  constructor() {
    this.progressSection = document.getElementById('progressSection')!;
    this.resultsSection = document.getElementById('resultsSection')!;
    this.progressBar = document.getElementById('progressBar')!;
    this.progressText = document.getElementById('progressText')!;
    this.issuesContainer = document.getElementById('issuesContainer')!;
    this.filterSection = document.getElementById('filterSection');
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

    // Initialize filters
    this.initializeFilters(results);

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

  // ==========================================================================
  // STREAMING MODE METHODS
  // ==========================================================================

  /**
   * Initialize streaming mode for real-time issue display
   */
  initializeStreamingMode(): void {
    this.streamingMode = true;
    this.currentIssues = [];
    this.currentGroups.clear();
    this.categoryNav = null;

    // Reset stats display
    document.getElementById('safeCount')!.textContent = '—';
    document.getElementById('errorCount')!.textContent = '0';
    document.getElementById('warningCount')!.textContent = '0';
    document.getElementById('infoCount')!.textContent = '0';

    // Initialize container with streaming layout
    this.issuesContainer.innerHTML = `
      <div class="results-summary streaming">
        <h3>분석 중...</h3>
        <p>총 <span id="liveIssueCount">0</span>개의 문제 발견</p>
        <p class="rule-count">(${TOTAL_RULE_COUNT}개 규칙 검사 중)</p>
      </div>
      <div class="category-nav" id="liveCategoryNav"></div>
    `;

    this.categoryNav = document.getElementById('liveCategoryNav');
    this.resultsSection.classList.add('show');
  }

  /**
   * Add an issue in real-time during streaming mode
   */
  addIssueRealtime(issue: Issue): void {
    if (!this.streamingMode) return;

    this.currentIssues.push(issue);
    this.updateStatsDisplay();

    // Get or create category section
    const category = issue.category || 'invalidObjects';
    let section = this.currentGroups.get(category);

    if (!section) {
      section = this.createCategorySectionElement(category);
      this.insertCategorySectionInOrder(section, category);
      this.currentGroups.set(category, section);
      this.updateCategoryNav();
    }

    // Create and insert issue element
    const issueElement = this.htmlToElement(this.renderIssue(issue));
    issueElement.classList.add('issue-enter');
    this.insertIssueBySeverity(section, issueElement, issue.severity);

    // Update category header counts
    this.updateCategoryCounts(category);

    // Trigger enter animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        issueElement.classList.add('issue-enter-active');
      });
    });
  }

  /**
   * Finalize streaming mode and show final results
   */
  finalizeStreamingMode(results: AnalysisResults): void {
    this.streamingMode = false;

    // Update summary text
    const summaryEl = this.issuesContainer.querySelector('.results-summary');
    if (summaryEl) {
      if (results.issues.length === 0) {
        summaryEl.innerHTML = `
          <div class="no-issues-icon">✅</div>
          <h3>호환성 문제가 발견되지 않았습니다!</h3>
          <p>분석한 덤프 파일은 MySQL 8.4로 업그레이드하는데 문제가 없어 보입니다.</p>
          <p class="rule-count">(${TOTAL_RULE_COUNT}개의 호환성 규칙을 검사했으며, 실제 환경에서 추가 테스트를 권장합니다)</p>
        `;
        summaryEl.classList.add('no-issues-summary');
      } else {
        const categoryCount = this.currentGroups.size;
        summaryEl.innerHTML = `
          <h3>분석 결과 요약</h3>
          <p>총 ${results.issues.length}개의 호환성 문제가 ${categoryCount}개 카테고리에서 발견되었습니다.</p>
          <p class="rule-count">(${TOTAL_RULE_COUNT}개 규칙 검사 완료)</p>
        `;
      }
      summaryEl.classList.remove('streaming');
    }

    // Update final stats
    document.getElementById('safeCount')!.textContent =
      results.issues.length === 0 ? '✓' : '—';
  }

  private updateStatsDisplay(): void {
    const stats = {
      error: this.currentIssues.filter(i => i.severity === 'error').length,
      warning: this.currentIssues.filter(i => i.severity === 'warning').length,
      info: this.currentIssues.filter(i => i.severity === 'info').length
    };

    document.getElementById('errorCount')!.textContent = String(stats.error);
    document.getElementById('warningCount')!.textContent = String(stats.warning);
    document.getElementById('infoCount')!.textContent = String(stats.info);

    // Update live issue count
    const liveCount = document.getElementById('liveIssueCount');
    if (liveCount) {
      liveCount.textContent = String(this.currentIssues.length);
    }
  }

  private createCategorySectionElement(category: RuleCategory): HTMLElement {
    const section = document.createElement('div');
    section.className = 'category-section';
    section.id = `category-${category}`;
    section.innerHTML = `
      <div class="category-header">
        <h3 class="category-title">${CATEGORY_LABELS[category]}</h3>
        <div class="category-counts">
          <span class="count-badge error" data-count="error" style="display: none;">0 오류</span>
          <span class="count-badge warning" data-count="warning" style="display: none;">0 경고</span>
          <span class="count-badge info" data-count="info" style="display: none;">0 정보</span>
        </div>
      </div>
      <p class="category-description">${CATEGORY_DESCRIPTIONS[category]}</p>
      <div class="category-issues"></div>
    `;
    return section;
  }

  private insertCategorySectionInOrder(section: HTMLElement, category: RuleCategory): void {
    const categoryIndex = CATEGORY_ORDER.indexOf(category);
    const existingSections = Array.from(this.issuesContainer.querySelectorAll('.category-section'));

    let insertBefore: HTMLElement | null = null;

    for (const existing of existingSections) {
      const existingCategory = existing.id.replace('category-', '') as RuleCategory;
      const existingIndex = CATEGORY_ORDER.indexOf(existingCategory);
      if (existingIndex > categoryIndex) {
        insertBefore = existing as HTMLElement;
        break;
      }
    }

    if (insertBefore) {
      this.issuesContainer.insertBefore(section, insertBefore);
    } else {
      this.issuesContainer.appendChild(section);
    }
  }

  private insertIssueBySeverity(section: HTMLElement, issueElement: Element, severity: Severity): void {
    const issuesContainer = section.querySelector('.category-issues');
    if (!issuesContainer) return;

    const severityOrder = SEVERITY_ORDER[severity];
    const existingIssues = Array.from(issuesContainer.querySelectorAll('.issue-card'));

    let insertBefore: Element | null = null;

    for (const existing of existingIssues) {
      const existingSeverity = existing.classList.contains('error')
        ? 'error'
        : existing.classList.contains('warning')
        ? 'warning'
        : 'info';
      const existingOrder = SEVERITY_ORDER[existingSeverity as Severity];

      if (existingOrder > severityOrder) {
        insertBefore = existing;
        break;
      }
    }

    if (insertBefore) {
      issuesContainer.insertBefore(issueElement, insertBefore);
    } else {
      issuesContainer.appendChild(issueElement);
    }
  }

  private updateCategoryCounts(category: RuleCategory): void {
    const section = this.currentGroups.get(category);
    if (!section) return;

    const categoryIssues = this.currentIssues.filter(i => (i.category || 'invalidObjects') === category);
    const counts = {
      error: categoryIssues.filter(i => i.severity === 'error').length,
      warning: categoryIssues.filter(i => i.severity === 'warning').length,
      info: categoryIssues.filter(i => i.severity === 'info').length
    };

    const errorBadge = section.querySelector('[data-count="error"]') as HTMLElement;
    const warningBadge = section.querySelector('[data-count="warning"]') as HTMLElement;
    const infoBadge = section.querySelector('[data-count="info"]') as HTMLElement;

    if (errorBadge) {
      errorBadge.textContent = `${counts.error} 오류`;
      errorBadge.style.display = counts.error > 0 ? '' : 'none';
    }
    if (warningBadge) {
      warningBadge.textContent = `${counts.warning} 경고`;
      warningBadge.style.display = counts.warning > 0 ? '' : 'none';
    }
    if (infoBadge) {
      infoBadge.textContent = `${counts.info} 정보`;
      infoBadge.style.display = counts.info > 0 ? '' : 'none';
    }
  }

  private updateCategoryNav(): void {
    if (!this.categoryNav) return;

    const navItems: string[] = [];
    for (const category of CATEGORY_ORDER) {
      if (this.currentGroups.has(category)) {
        const categoryIssues = this.currentIssues.filter(i => (i.category || 'invalidObjects') === category);
        const errorCount = categoryIssues.filter(i => i.severity === 'error').length;
        const warningCount = categoryIssues.filter(i => i.severity === 'warning').length;
        const infoCount = categoryIssues.filter(i => i.severity === 'info').length;

        navItems.push(`
          <a href="#category-${category}" class="category-nav-item">
            <span class="category-nav-label">${CATEGORY_LABELS[category]}</span>
            <span class="category-nav-count">
              ${errorCount > 0 ? `<span class="count-error">${errorCount}</span>` : ''}
              ${warningCount > 0 ? `<span class="count-warning">${warningCount}</span>` : ''}
              ${infoCount > 0 ? `<span class="count-info">${infoCount}</span>` : ''}
            </span>
          </a>
        `);
      }
    }

    this.categoryNav.innerHTML = navItems.join('');
  }

  private htmlToElement(html: string): HTMLElement {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild as HTMLElement;
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

  // ==========================================================================
  // FILTERING METHODS
  // ==========================================================================

  /**
   * Initialize filter UI and event listeners
   */
  initializeFilters(results: AnalysisResults): void {
    this.allIssues = results.issues;

    if (!this.filterSection) return;

    // Show filter section if there are issues
    if (results.issues.length > 0) {
      this.filterSection.classList.add('show');
    }

    // Initialize category filter buttons
    this.initializeCategoryFilters();

    // Add event listeners
    this.attachFilterEventListeners();
  }

  /**
   * Initialize category filter buttons
   */
  private initializeCategoryFilters(): void {
    const container = document.getElementById('categoryFilterButtons');
    if (!container) return;

    // Get unique categories from all issues
    const categories = new Set<RuleCategory>();
    this.allIssues.forEach(issue => {
      categories.add(issue.category || 'invalidObjects');
    });

    // Create buttons
    const buttons: string[] = ['<button class="filter-btn active" data-filter="category" data-value="all">전체</button>'];

    CATEGORY_ORDER.forEach(category => {
      if (categories.has(category)) {
        buttons.push(`<button class="filter-btn" data-filter="category" data-value="${category}">${CATEGORY_LABELS[category]}</button>`);
      }
    });

    container.innerHTML = buttons.join('');
  }

  /**
   * Attach filter event listeners
   */
  private attachFilterEventListeners(): void {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const filterType = target.getAttribute('data-filter');
        const value = target.getAttribute('data-value');

        if (!filterType || !value) return;

        // Update active state
        const siblings = target.parentElement?.querySelectorAll(`.filter-btn[data-filter="${filterType}"]`);
        siblings?.forEach(s => s.classList.remove('active'));
        target.classList.add('active');

        // Update filter state
        if (filterType === 'severity') {
          this.filterState.severity = value as any;
        } else if (filterType === 'category') {
          this.filterState.category = value as any;
        }

        this.applyFilters();
      });
    });

    // Search input
    const searchInput = document.getElementById('filterSearchInput') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterState.searchText = (e.target as HTMLInputElement).value.toLowerCase();
        this.applyFilters();
      });
    }

    // Reset button
    const resetBtn = document.getElementById('resetFilterBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }
  }

  /**
   * Apply current filters to issues
   */
  applyFilters(): void {
    const filtered = this.filterIssues(this.allIssues, this.filterState);

    // Re-render issues with filtered data
    const groupedIssues = this.groupIssuesByCategory(filtered);
    this.issuesContainer.innerHTML = this.renderGroupedIssues(groupedIssues, {
      issues: filtered,
      stats: {
        safe: 0,
        error: filtered.filter(i => i.severity === 'error').length,
        warning: filtered.filter(i => i.severity === 'warning').length,
        info: filtered.filter(i => i.severity === 'info').length
      }
    });
  }

  /**
   * Filter issues based on filter state
   */
  private filterIssues(issues: Issue[], filter: FilterState): Issue[] {
    return issues.filter(issue => {
      // Severity filter
      if (filter.severity !== 'all' && issue.severity !== filter.severity) {
        return false;
      }

      // Category filter
      const issueCategory = issue.category || 'invalidObjects';
      if (filter.category !== 'all' && issueCategory !== filter.category) {
        return false;
      }

      // Search text filter
      if (filter.searchText) {
        const searchLower = filter.searchText;
        const matchFields = [
          issue.title,
          issue.description,
          issue.suggestion,
          issue.location,
          issue.code,
          issue.tableName,
          issue.columnName,
          issue.objectName
        ].filter(Boolean).map(s => s!.toLowerCase());

        const hasMatch = matchFields.some(field => field.includes(searchLower));
        if (!hasMatch) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Reset all filters
   */
  private resetFilters(): void {
    this.filterState = {
      severity: 'all',
      category: 'all',
      searchText: ''
    };

    // Reset UI
    document.querySelectorAll('.filter-btn').forEach(btn => {
      const value = btn.getAttribute('data-value');
      if (value === 'all') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const searchInput = document.getElementById('filterSearchInput') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = '';
    }

    this.applyFilters();
  }

  /**
   * Get filtered issues (for export)
   */
  getFilteredIssues(): Issue[] {
    return this.filterIssues(this.allIssues, this.filterState);
  }

  /**
   * Get all issues (for export)
   */
  getAllIssues(): Issue[] {
    return this.allIssues;
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
      showError('클립보드 복사에 실패했습니다.', {
        errorType: 'CLIPBOARD_ERROR',
        errorMessage: '클립보드 복사에 실패했습니다 (폴백 방식).',
        additionalInfo: { method: 'execCommand' }
      });
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
      showError('클립보드 복사에 실패했습니다.', {
        errorType: 'CLIPBOARD_ERROR',
        errorMessage: '클립보드 복사에 실패했습니다.',
        additionalInfo: { method: 'navigator.clipboard' }
      });
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
