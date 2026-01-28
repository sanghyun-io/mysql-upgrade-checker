import { FileAnalyzer } from './analyzer';
import { UIManager, copyToClipboard } from './ui';
import type { AnalysisResults, Issue, AnalysisProgress } from './types';
import { CHECK_GUIDE, SERVER_REQUIRED_CHECKS, COMBINED_SERVER_CHECK_QUERY } from './constants';
import { parseServerResult, type ServerQueryResult } from './parsers/server-result-parser';
import { showSuccess, showError, showInfo } from './toast';
import {
  generateMySQLShellReport,
  generateCSVReport,
  generateJSONReport,
  generateFixQueriesSQL,
  downloadFile
} from './report';

let uploadedFiles: File[] = [];
let analysisResults: AnalysisResults = {
  issues: [],
  stats: { safe: 0, error: 0, warning: 0, info: 0 }
};

const fileAnalyzer = new FileAnalyzer();
const uiManager = new UIManager();

// ============================================================================
// Tab Navigation
// ============================================================================
function initializeTabs(): void {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (!tabId) return;

      // Remove active from all tabs
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      // Activate clicked tab
      btn.classList.add('active');
      const content = document.getElementById(`tab-${tabId}`);
      if (content) {
        content.classList.add('active');
      }

      // Initialize content if needed
      if (tabId === 'check-guide') {
        initializeCheckGuide();
      } else if (tabId === 'server-query') {
        initializeServerChecks();
      }
    });
  });
}

// ============================================================================
// Check Guide
// ============================================================================
let checkGuideInitialized = false;

function initializeCheckGuide(): void {
  if (checkGuideInitialized) return;
  checkGuideInitialized = true;

  const container = document.getElementById('checkGuideContent');
  if (!container) return;

  // Calculate stats
  let totalChecks = 0;
  let dumpChecks = 0;
  let serverChecks = 0;

  CHECK_GUIDE.forEach((category) => {
    category.checks.forEach((check) => {
      totalChecks++;
      if (check.serverRequired) {
        serverChecks++;
      } else {
        dumpChecks++;
      }
    });
  });

  // Update stats display
  const totalEl = document.getElementById('totalChecksCount');
  const dumpEl = document.getElementById('dumpChecksCount');
  const serverEl = document.getElementById('serverChecksCount');
  if (totalEl) totalEl.textContent = String(totalChecks);
  if (dumpEl) dumpEl.textContent = String(dumpChecks);
  if (serverEl) serverEl.textContent = String(serverChecks);

  // Render categories
  container.innerHTML = CHECK_GUIDE.map((category) => {
    const isServerRequired = category.id === 'serverRequired';
    return `
      <div class="guide-category ${isServerRequired ? 'server-required' : ''}" data-category="${category.id}">
        <div class="guide-category-header" onclick="toggleCategory('${category.id}')">
          <div class="guide-category-title">
            <h3>${category.name}</h3>
            <span class="guide-category-count">${category.checks.length}개</span>
          </div>
          <span class="guide-category-toggle">▼</span>
        </div>
        <div class="guide-category-desc">${category.description}</div>
        <div class="guide-category-items">
          ${category.checks.map((check) => `
            <div class="guide-item">
              <span class="guide-item-badge ${check.severity}">${check.severity.toUpperCase()}</span>
              <div class="guide-item-content">
                <div class="guide-item-name">
                  ${check.name}
                  ${check.serverRequired ? '<span class="server-badge">서버 필요</span>' : ''}
                </div>
                <div class="guide-item-desc">${check.description}</div>
                ${check.mysqlShellCheckId ? `<div class="guide-item-id">ID: ${check.mysqlShellCheckId}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

(window as any).toggleCategory = (categoryId: string) => {
  const category = document.querySelector(`.guide-category[data-category="${categoryId}"]`);
  if (category) {
    category.classList.toggle('expanded');
  }
};

// ============================================================================
// Server Checks
// ============================================================================
let serverChecksInitialized = false;

function initializeServerChecks(): void {
  if (serverChecksInitialized) return;
  serverChecksInitialized = true;

  // Populate server checks list
  const container = document.getElementById('serverChecksList');
  if (container) {
    container.innerHTML = SERVER_REQUIRED_CHECKS.map((check) => `
      <div class="server-check-item">
        <h4>${check.name}</h4>
        <p>${check.description}</p>
      </div>
    `).join('');
  }

  // Populate server check dropdown
  const select = document.getElementById('serverCheckSelect') as HTMLSelectElement;
  if (select) {
    // Add options for each check
    SERVER_REQUIRED_CHECKS.forEach((check) => {
      const option = document.createElement('option');
      option.value = check.id;
      option.textContent = check.name;
      select.appendChild(option);
    });

    // Add change event listener
    select.addEventListener('change', (e) => {
      const checkId = (e.target as HTMLSelectElement).value;
      if (checkId) {
        displayServerCheck(checkId);
      } else {
        hideServerCheck();
      }
    });
  }
}

function displayServerCheck(checkId: string): void {
  const check = SERVER_REQUIRED_CHECKS.find(c => c.id === checkId);
  if (!check) return;

  // Show description
  const descEl = document.getElementById('serverCheckDescription');
  if (descEl) {
    descEl.innerHTML = `
      <p><strong>설명:</strong> ${check.description}</p>
      <p><strong>필요 이유:</strong> ${check.reason}</p>
      <p><strong>결과 분석:</strong> ${check.analyzeResult}</p>
    `;
    descEl.style.display = 'block';
  }

  // Show query
  const queryDisplayEl = document.getElementById('serverQueryDisplay');
  const queryCodeEl = document.getElementById('serverQueryCode');
  if (queryDisplayEl && queryCodeEl) {
    queryCodeEl.textContent = check.query;
    queryDisplayEl.style.display = 'block';
  }
}

function hideServerCheck(): void {
  const descEl = document.getElementById('serverCheckDescription');
  const queryDisplayEl = document.getElementById('serverQueryDisplay');

  if (descEl) descEl.style.display = 'none';
  if (queryDisplayEl) queryDisplayEl.style.display = 'none';
}

(window as any).copyServerQuery = () => {
  const queryCodeEl = document.getElementById('serverQueryCode');
  if (queryCodeEl && queryCodeEl.textContent) {
    navigator.clipboard.writeText(queryCodeEl.textContent).then(() => {
      showSuccess('쿼리가 클립보드에 복사되었습니다!');
    }).catch(() => {
      showError('클립보드 복사에 실패했습니다.', {
        errorType: 'CLIPBOARD_ERROR',
        errorMessage: '클립보드 복사 실패'
      });
    });
  }
};

// ============================================================================
// Server Query Functions
// ============================================================================
(window as any).downloadServerQuery = () => {
  const content = COMBINED_SERVER_CHECK_QUERY;
  downloadText(content, 'mysql84_server_check.sql');
};

(window as any).copyCommand = (button: HTMLButtonElement) => {
  const codeBlock = button.parentElement;
  const code = codeBlock?.querySelector('code');
  if (code) {
    navigator.clipboard.writeText(code.textContent || '').then(() => {
      const originalText = button.textContent;
      button.textContent = '복사됨!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    });
  }
};

// Server result file upload handler
const serverResultInput = document.getElementById('serverResultInput') as HTMLInputElement;
if (serverResultInput) {
  serverResultInput.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      try {
        const content = await file.text();
        analyzeServerResult(content, file.name);
      } catch (error) {
        console.error('Failed to read server result file:', error);
        showError('파일을 읽는 중 오류가 발생했습니다.', {
          errorType: 'FILE_READ_ERROR',
          errorMessage: '서버 결과 파일을 읽는 중 오류가 발생했습니다.',
          additionalInfo: { fileName: file.name }
        });
      }
    }
  });
}

function analyzeServerResult(content: string, fileName: string): void {
  let result: ServerQueryResult;

  try {
    result = parseServerResult(content);
  } catch (error) {
    showError('파일 형식을 인식할 수 없습니다. JSON 또는 TSV 형식으로 저장해주세요.', {
      errorType: 'FILE_FORMAT_ERROR',
      errorMessage: '서버 결과 파일의 형식을 인식할 수 없습니다.',
      additionalInfo: { fileName, error: String(error) }
    });
    return;
  }

  if (result.rows.length === 0) {
    showInfo('서버 결과 파일이 비어있거나 데이터가 없습니다.');
    return;
  }

  // Detect check type from result structure
  const serverIssues = analyzeServerQueryData(result);

  if (serverIssues.length === 0) {
    showSuccess('서버 검사 결과: 문제가 발견되지 않았습니다!');
  } else {
    // Create results object
    const serverResults: AnalysisResults = {
      issues: serverIssues,
      stats: {
        safe: serverIssues.length === 0 ? 1 : 0,
        error: serverIssues.filter((i) => i.severity === 'error').length,
        warning: serverIssues.filter((i) => i.severity === 'warning').length,
        info: serverIssues.filter((i) => i.severity === 'info').length
      }
    };

    // Switch to dump analysis tab and show results
    const dumpTab = document.querySelector('.tab-btn[data-tab="dump-analysis"]') as HTMLElement;
    if (dumpTab) dumpTab.click();

    // Update global analysisResults for export functionality
    analysisResults = serverResults;
    uiManager.displayResults(serverResults);
    showInfo(`서버 검사 완료: ${serverIssues.length}개의 문제가 발견되었습니다.`);
  }
}

/**
 * Analyze server query data and detect issues
 */
function analyzeServerQueryData(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];

  // Detect check type from column names
  const columns = result.columns.map(c => c.toLowerCase());

  // Check for user authentication data (User, Host, plugin)
  if (columns.includes('user') && columns.includes('plugin')) {
    const authIssues = fileAnalyzer.analyzeUserAuthPlugins(result);
    issues.push(...authIssues);
  }

  // Check for system variable data (VARIABLE_NAME, VARIABLE_VALUE)
  if (columns.includes('variable_name') && columns.includes('variable_value')) {
    const sysvarIssues = fileAnalyzer.analyzeSysVarDefaults(result);
    issues.push(...sysvarIssues);
  }

  // Handle combined query format with check_type column
  if (columns.includes('check_type')) {
    for (const row of result.rows) {
      const checkType = String(row.check_type || row.CHECK_TYPE);

      if (checkType === 'user_auth') {
        // Extract user auth data
        const userResult: ServerQueryResult = {
          columns: ['User', 'Host', 'plugin'],
          rows: [{
            User: row.user_name || row.User,
            Host: row.host || row.Host,
            plugin: row.auth_plugin || row.plugin
          }]
        };
        issues.push(...fileAnalyzer.analyzeUserAuthPlugins(userResult));
      } else if (checkType === 'sys_vars') {
        // Extract system variable data
        const sysvarResult: ServerQueryResult = {
          columns: ['VARIABLE_NAME', 'VARIABLE_VALUE'],
          rows: [{
            VARIABLE_NAME: row.var_name || row.VARIABLE_NAME,
            VARIABLE_VALUE: row.var_value || row.VARIABLE_VALUE
          }]
        };
        issues.push(...fileAnalyzer.analyzeSysVarDefaults(sysvarResult));
      }
    }
  }

  return issues;
}

// DOM Elements
const uploadSection = document.getElementById('uploadSection')!;
const actionSection = document.getElementById('actionSection')!;

// 폴더 선택을 위한 input 생성
const folderInput = document.createElement('input');
folderInput.type = 'file';
folderInput.setAttribute('webkitdirectory', '');
folderInput.setAttribute('directory', '');
folderInput.multiple = true;
folderInput.style.display = 'none';
document.body.appendChild(folderInput);

// 전역 함수 (HTML에서 호출)
(window as any).selectFolder = () => {
  folderInput.click();
};

(window as any).analyzeFiles = async () => {
  // Show progress first, then initialize streaming mode
  // (showProgress hides resultsSection, so we must call initializeStreamingMode after)
  uiManager.showProgress();
  uiManager.initializeStreamingMode();

  // Run analysis - callbacks will be invoked for each issue
  analysisResults = await fileAnalyzer.analyzeFiles(uploadedFiles);

  // Finalize UI
  uiManager.hideProgress();
  uiManager.finalizeStreamingMode(analysisResults);
};

(window as any).resetAll = () => {
  uploadedFiles = [];
  analysisResults = {
    issues: [],
    stats: { safe: 0, error: 0, warning: 0, info: 0 }
  };

  uploadSection.style.display = 'block';
  actionSection.style.display = 'none';
  document.getElementById('resultsSection')!.classList.remove('show');
  document.getElementById('progressSection')!.classList.remove('show');
  folderInput.value = '';
};

(window as any).exportReport = () => {
  const report = {
    ...analysisResults,
    exportedAt: new Date().toISOString(),
    version: '1.0.0'
  };

  downloadJSON(report, `mysql-upgrade-report-${new Date().toISOString().split('T')[0]}.json`);
};

(window as any).exportAllFixQueries = () => {
  const queries = analysisResults.issues
    .filter((issue) => issue.fixQuery)
    .map((issue) => {
      return `-- ${issue.title}\n-- 위치: ${issue.location}\n${issue.fixQuery}\n`;
    })
    .join('\n\n');

  if (queries) {
    const content = [
      `-- MySQL 8.0 to 8.4 업그레이드 수정 쿼리\n`,
      `-- 생성일시: ${new Date().toISOString()}\n`,
      `-- 총 ${analysisResults.issues.filter((i) => i.fixQuery).length}개의 수정 쿼리\n\n`,
      queries
    ].join('');

    downloadText(content, `mysql-upgrade-fix-queries-${new Date().toISOString().split('T')[0]}.sql`);
  } else {
    showInfo('생성할 수정 쿼리가 없습니다.');
  }
};

// Event Listeners
folderInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    handleFiles(target.files);
  }
});

// 복사 버튼 이벤트 위임
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('btn-copy')) {
    const query = target.getAttribute('data-query');
    if (query) {
      copyToClipboard(query, target as HTMLButtonElement);
    }
  }
});

// Helper Functions
function handleFiles(files: FileList): void {
  const fileArray = Array.from(files);

  if (fileArray.length === 0) return;

  uploadedFiles = [];

  const firstFile = fileArray[0];
  const folderPath = (firstFile as any).webkitRelativePath || firstFile.name;
  const folderName = folderPath.split('/')[0] || '알 수 없음';

  uploadedFiles = fileArray;

  // 파일 통계
  const stats = {
    total: uploadedFiles.length,
    schema: 0,
    data: 0,
    skip: 0
  };

  uploadedFiles.forEach((file) => {
    const fileType = detectFileType(file.name);
    if (fileType === 'schema') stats.schema++;
    else if (fileType === 'data') stats.data++;
    else if (fileType === 'skip') stats.skip++;
  });

  // UI 업데이트
  document.getElementById('folderName')!.textContent = folderName;
  document.getElementById('totalFiles')!.textContent = String(stats.total);
  document.getElementById('schemaFiles')!.textContent = String(stats.schema);
  document.getElementById('dataFiles')!.textContent = String(stats.data);
  document.getElementById('skipFiles')!.textContent = String(stats.skip);

  uploadSection.style.display = 'none';
  actionSection.style.display = 'block';
}

function detectFileType(fileName: string): string {
  if (
    fileName.startsWith('load-progress') ||
    fileName.startsWith('dump-progress') ||
    fileName === '@.done.json'
  ) {
    return 'skip';
  }

  if (fileName.endsWith('.sql')) return 'schema';
  if (fileName.endsWith('.json') && fileName.includes('@.')) return 'metadata';
  if (fileName.endsWith('.tsv')) return 'data';
  if (fileName.endsWith('.txt')) return 'data';

  return 'unknown';
}

function downloadJSON(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  downloadBlob(blob, filename);
}

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Method Tabs (inside Step 2)
// ============================================================================
function switchMethodTab(method: string): void {
  const methodTabs = document.querySelectorAll('.method-tab');
  const methodContents = document.querySelectorAll('.method-content');

  // Remove active from all tabs and contents
  methodTabs.forEach((t) => t.classList.remove('active'));
  methodContents.forEach((c) => c.classList.remove('active'));

  // Activate target tab and content
  const targetTab = document.querySelector(`.method-tab[data-method="${method}"]`);
  const targetContent = document.getElementById(`method-${method}`);
  if (targetTab) targetTab.classList.add('active');
  if (targetContent) targetContent.classList.add('active');
}

function initializeMethodTabs(): void {
  const methodTabs = document.querySelectorAll('.method-tab');

  methodTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const method = tab.getAttribute('data-method');
      if (method) switchMethodTab(method);
    });
  });

  // Handle method links (e.g., "로컬 연결" link in tip)
  const methodLinks = document.querySelectorAll('.method-link');
  methodLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const method = link.getAttribute('data-method');
      if (method) switchMethodTab(method);
    });
  });
}

// ============================================================================
// Real-time Analysis Callback Setup
// ============================================================================
function setupRealtimeAnalysis(): void {
  // Set callbacks for real-time updates
  fileAnalyzer.setCallbacks(
    // onIssue callback
    (issue: Issue) => {
      uiManager.addIssueRealtime(issue);
    },
    // onProgress callback
    (progress: AnalysisProgress) => {
      uiManager.updateProgress(
        progress.currentFileIndex + 1,
        progress.totalFiles,
        progress.currentFile,
        progress.fileType
      );
    }
  );
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export results as JSON
 */
(window as any).exportJSON = function (): void {
  if (analysisResults.issues.length === 0) {
    showInfo('내보낼 결과가 없습니다.');
    return;
  }

  const json = generateJSONReport(analysisResults);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(json, `mysql-upgrade-check-${timestamp}.json`, 'application/json');
  showSuccess('JSON 리포트를 다운로드했습니다.');
};

/**
 * Export results as CSV
 */
(window as any).exportCSV = function (): void {
  if (analysisResults.issues.length === 0) {
    showInfo('내보낼 결과가 없습니다.');
    return;
  }

  const csv = generateCSVReport(analysisResults.issues);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(csv, `mysql-upgrade-check-${timestamp}.csv`, 'text/csv');
  showSuccess('CSV 리포트를 다운로드했습니다.');
};

/**
 * Export results in MySQL Shell format
 */
(window as any).exportMySQLShell = function (): void {
  if (analysisResults.issues.length === 0) {
    showInfo('내보낼 결과가 없습니다.');
    return;
  }

  const report = generateMySQLShellReport(analysisResults.issues, analysisResults.metadata);
  const json = JSON.stringify(report, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(json, `mysql-shell-upgrade-check-${timestamp}.json`, 'application/json');
  showSuccess('MySQL Shell 형식 리포트를 다운로드했습니다.');
};

/**
 * Export all fix queries as SQL
 */
(window as any).exportAllFixQueries = function (): void {
  const fixableIssues = analysisResults.issues.filter((i) => i.fixQuery);

  if (fixableIssues.length === 0) {
    showInfo('자동 수정 쿼리가 없습니다.');
    return;
  }

  const sql = generateFixQueriesSQL(analysisResults.issues);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(sql, `mysql-upgrade-fixes-${timestamp}.sql`, 'text/plain');
  showSuccess(`${fixableIssues.length}개의 수정 쿼리를 다운로드했습니다.`);
};

// Keep old exportReport for backwards compatibility
(window as any).exportReport = (window as any).exportJSON;

// ============================================================================
// Initialize on DOMContentLoaded
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  initializeMethodTabs();
  setupRealtimeAnalysis();
});
