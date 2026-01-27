import { FileAnalyzer } from './analyzer';
import { UIManager, copyToClipboard } from './ui';
import type { AnalysisResults } from './types';

let uploadedFiles: File[] = [];
let analysisResults: AnalysisResults = {
  issues: [],
  stats: { safe: 0, error: 0, warning: 0, info: 0 }
};

const fileAnalyzer = new FileAnalyzer();
const uiManager = new UIManager();

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
  uiManager.showProgress();

  let processedFiles = 0;

  for (const file of uploadedFiles) {
    processedFiles++;
    const fileType = detectFileType(file.name);
    uiManager.updateProgress(processedFiles, uploadedFiles.length, file.name, fileType);

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  analysisResults = await fileAnalyzer.analyzeFiles(uploadedFiles);

  uiManager.hideProgress();
  setTimeout(() => {
    uiManager.displayResults(analysisResults);
  }, 500);
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
    alert('생성할 수정 쿼리가 없습니다.');
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
