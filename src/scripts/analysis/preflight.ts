/**
 * Pre-flight Checklist
 *
 * Defines pre-flight check items for migration preparation.
 * Each item provides a query to copy and expected result format.
 */

export type PreflightStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface PreflightItem {
  /** Unique identifier */
  id: string;
  /** Display title */
  title: string;
  /** Description of what this check verifies */
  description: string;
  /** Whether this check is required (must pass) or recommended */
  required: boolean;
  /** SQL query to execute (null for manual checks like backup confirmation) */
  query: string | null;
  /** Current check status */
  status: PreflightStatus;
  /** Result message after check */
  resultMessage?: string;
}

/**
 * Generate the default pre-flight checklist.
 */
export function createPreflightChecklist(): PreflightItem[] {
  return [
    {
      id: 'backup_check',
      title: '데이터베이스 백업 확인',
      description: '마이그레이션 전 전체 데이터베이스 백업이 완료되었는지 확인합니다.',
      required: true,
      query: null, // Manual checkbox
      status: 'pending',
    },
    {
      id: 'version_check',
      title: 'MySQL 버전 확인',
      description: '현재 MySQL 서버 버전을 확인합니다. 8.0.x → 8.4 업그레이드를 지원합니다.',
      required: true,
      query: 'SELECT VERSION();',
      status: 'pending',
    },
    {
      id: 'disk_space_check',
      title: '디스크 공간 확인',
      description: '스키마별 데이터 크기를 확인하여 ALTER TABLE에 필요한 여유 공간을 파악합니다.',
      required: false,
      query: [
        'SELECT table_schema,',
        '  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb',
        'FROM information_schema.tables',
        'GROUP BY table_schema',
        'ORDER BY size_mb DESC;',
      ].join('\n'),
      status: 'pending',
    },
    {
      id: 'connections_check',
      title: '활성 연결 확인',
      description: '현재 활성 연결 수를 확인합니다. 마이그레이션 시 연결을 최소화하세요.',
      required: false,
      query: 'SHOW PROCESSLIST;',
      status: 'pending',
    },
    {
      id: 'grants_check',
      title: '권한 확인',
      description: '현재 사용자의 권한을 확인합니다. SUPER 등 제거된 권한이 있는지 검사합니다.',
      required: false,
      query: 'SHOW GRANTS;',
      status: 'pending',
    },
    {
      id: 'variables_check',
      title: '시스템 변수 확인',
      description: 'MySQL 8.4에서 제거된 시스템 변수가 설정되어 있는지 확인합니다.',
      required: false,
      query: 'SHOW VARIABLES;',
      status: 'pending',
    },
  ];
}

/**
 * Get the completion status summary of a checklist.
 */
export function getPreflightSummary(items: PreflightItem[]): {
  total: number;
  completed: number;
  required: number;
  requiredCompleted: number;
  allRequiredPassed: boolean;
} {
  const total = items.length;
  const completed = items.filter(i => i.status === 'passed' || i.status === 'skipped').length;
  const required = items.filter(i => i.required).length;
  // Only count required items with status 'passed' — skipped required items do NOT satisfy the safety gate.
  const requiredCompleted = items.filter(i => i.required && i.status === 'passed').length;

  return {
    total,
    completed,
    required,
    requiredCompleted,
    allRequiredPassed: required > 0 ? requiredCompleted === required : true,
  };
}
