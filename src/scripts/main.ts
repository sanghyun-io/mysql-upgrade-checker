import { FileAnalyzer } from './analyzer';
import { UIManager, copyToClipboard } from './ui';
import type { AnalysisResults, Issue, AnalysisProgress } from './types';
import { CHECK_GUIDE, SERVER_REQUIRED_CHECKS, COMBINED_SERVER_CHECK_QUERY } from './constants';
import { showSuccess, showError, showInfo } from './toast';

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

  const container = document.getElementById('serverChecksList');
  if (!container) return;

  container.innerHTML = SERVER_REQUIRED_CHECKS.map((check) => `
    <div class="server-check-item">
      <h4>${check.name}</h4>
      <p>${check.description}</p>
    </div>
  `).join('');
}

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

function analyzeServerResult(content: string, _fileName: string): void {
  // Try to parse as JSON first
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    // If not JSON, try to parse as tab-separated or text
    data = parseTextResult(content);
  }

  if (!data || Object.keys(data).length === 0) {
    showError('파일 형식을 인식할 수 없습니다. JSON 또는 텍스트 형식으로 저장해주세요.', {
      errorType: 'FILE_FORMAT_ERROR',
      errorMessage: '서버 결과 파일의 형식을 인식할 수 없습니다.',
      additionalInfo: { fileName: _fileName }
    });
    return;
  }

  // Analyze the server result data
  const serverIssues = processServerData(data);

  if (serverIssues.length === 0) {
    showSuccess('서버 검사 결과: 문제가 발견되지 않았습니다!');
  } else {
    // Merge with existing results or display separately
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

function parseTextResult(content: string): any {
  // Parse MySQL command-line output (tab-separated)
  const lines = content.split('\n').filter((l) => l.trim());
  const results: any[] = [];

  for (const line of lines) {
    if (line.startsWith('check_type\t')) {
      continue; // Skip header
    }
    const parts = line.split('\t');
    if (parts.length >= 2) {
      results.push({
        check_type: parts[0],
        data: parts.slice(1)
      });
    }
  }

  return { rows: results };
}

function processServerData(data: any): any[] {
  const issues: any[] = [];

  // Process user authentication data
  if (data.user_auth || (data.rows && data.rows.some((r: any) => r.check_type === 'user_auth'))) {
    const authData = data.user_auth || data.rows?.filter((r: any) => r.check_type === 'user_auth') || [];
    for (const user of authData) {
      const plugin = user.auth_plugin || user.plugin || user.data?.[2];
      const userName = user.user_name || user.User || user.data?.[0];
      const host = user.host || user.Host || user.data?.[1];

      if (plugin === 'mysql_native_password') {
        issues.push({
          id: 'server_auth_native',
          type: 'privilege',
          category: 'authentication',
          severity: 'error',
          title: 'mysql_native_password 사용자 발견',
          description: `사용자 '${userName}'@'${host}'가 mysql_native_password 플러그인을 사용하고 있습니다. MySQL 8.4에서 기본 비활성화됩니다.`,
          suggestion: 'caching_sha2_password로 마이그레이션하세요: ALTER USER ... IDENTIFIED WITH caching_sha2_password BY ...',
          location: `mysql.user: ${userName}@${host}`,
          mysqlShellCheckId: 'authMethodUsage'
        });
      } else if (plugin === 'sha256_password') {
        issues.push({
          id: 'server_auth_sha256',
          type: 'privilege',
          category: 'authentication',
          severity: 'warning',
          title: 'sha256_password 사용자 발견 (폐기 예정)',
          description: `사용자 '${userName}'@'${host}'가 sha256_password 플러그인을 사용하고 있습니다.`,
          suggestion: 'caching_sha2_password로 마이그레이션을 권장합니다.',
          location: `mysql.user: ${userName}@${host}`,
          mysqlShellCheckId: 'deprecatedDefaultAuth'
        });
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
  // Initialize streaming mode for real-time issue display
  uiManager.initializeStreamingMode();
  uiManager.showProgress();

  // Run analysis - events will be emitted for each issue
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
// Real-time Analysis Event Setup
// ============================================================================
function setupRealtimeAnalysis(): void {
  // Handle real-time issue detection
  fileAnalyzer.addEventListener('issue', (event) => {
    const issue = (event as CustomEvent<Issue>).detail;
    uiManager.addIssueRealtime(issue);
  });

  // Handle progress updates
  fileAnalyzer.addEventListener('progress', (event) => {
    const progress = (event as CustomEvent<AnalysisProgress>).detail;
    uiManager.updateProgress(
      progress.currentFileIndex + 1,
      progress.totalFiles,
      progress.currentFile,
      progress.fileType
    );
  });
}

// ============================================================================
// Initialize on DOMContentLoaded
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  initializeMethodTabs();
  setupRealtimeAnalysis();
});
