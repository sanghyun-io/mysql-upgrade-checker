/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Storage Engines
 * Covers: MyISAM and other deprecated storage engines
 */

import type { CompatibilityRule } from '../types';
import { DEPRECATED_ENGINES, SHARED_TABLESPACES, NON_NATIVE_PARTITION_ENGINES } from '../constants';
import { escapeRegex } from './utils';

// ============================================================================
// STORAGE ENGINE RULES
// ============================================================================
export const storageEngineRules: CompatibilityRule[] = [
  {
    id: 'myisam_engine',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENGINE\s*=\s*MyISAM/gi,
    severity: 'warning',
    title: 'MyISAM 엔진 사용',
    description: 'InnoDB 사용이 강력히 권장됩니다.',
    suggestion: 'ENGINE=InnoDB로 변경을 고려하세요.',
    mysqlShellCheckId: 'myisamEngine',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` ENGINE=InnoDB;`;
      }
      return null;
    }
  },
  {
    id: 'deprecated_engine',
    type: 'schema',
    category: 'invalidObjects',
    pattern: new RegExp(`ENGINE\\s*=\\s*(${DEPRECATED_ENGINES.filter(e => e !== 'MyISAM').join('|')})`, 'gi'),
    severity: 'warning',
    title: 'Deprecated 스토리지 엔진',
    description: `다음 스토리지 엔진은 deprecated되었거나 제한적으로 지원됩니다: ${DEPRECATED_ENGINES.filter(e => e !== 'MyISAM').join(', ')}`,
    suggestion: 'InnoDB 스토리지 엔진 사용을 강력히 권장합니다.',
    mysqlShellCheckId: 'myisamEngine',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/storage-engines.html',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` ENGINE=InnoDB;`;
      }
      return null;
    }
  },
  {
    id: 'non_native_partition',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENGINE\s*=\s*(?:MyISAM|MERGE|CSV)[^;]*PARTITION\s+BY/gi,
    severity: 'warning',
    title: '비네이티브 파티셔닝',
    description: 'MyISAM, MERGE, CSV 엔진의 파티셔닝은 deprecated되었습니다.',
    suggestion: 'InnoDB로 변경 후 파티셔닝을 사용하세요.',
    mysqlShellCheckId: 'nonNativePartitioning'
  },
  {
    id: 'invalid_engine_fk',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENGINE\s*=\s*(?:MyISAM|MEMORY|ARCHIVE)[^;]*FOREIGN\s+KEY/gi,
    severity: 'error',
    title: '비InnoDB 엔진의 외래키',
    description: 'MyISAM, MEMORY, ARCHIVE 엔진은 외래키를 지원하지 않습니다.',
    suggestion: 'ENGINE=InnoDB로 변경하세요.',
    mysqlShellCheckId: 'invalidEngineForeignKey'
  },
  {
    id: 'partitioned_tables_in_shared_tablespaces',
    type: 'schema',
    category: 'invalidObjects',
    pattern: new RegExp(
      `TABLESPACE\\s*=?\\s*(?:'|")?\\s*(${SHARED_TABLESPACES.map(escapeRegex).join('|')})(?:'|")?[^;]*PARTITION\\s+BY`,
      'gi'
    ),
    severity: 'error',
    title: '공유 테이블스페이스의 파티션 테이블',
    description: `파티션 테이블이 공유 테이블스페이스(${SHARED_TABLESPACES.join(', ')})에 있습니다. MySQL 8.4에서는 지원되지 않습니다.`,
    suggestion: '파티션 테이블을 file-per-table 테이블스페이스로 이동하거나 TABLESPACE 절을 제거하세요.',
    mysqlShellCheckId: 'partitionedTablesInSharedTablespaces',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations.html',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return [
          `-- 공유 테이블스페이스에서 파티션 테이블을 제거하려면:`,
          `ALTER TABLE \`${tableMatch[1]}\` TABLESPACE = innodb_file_per_table;`,
          ``,
          `-- 또는 파티셔닝을 제거:`,
          `-- ALTER TABLE \`${tableMatch[1]}\` REMOVE PARTITIONING;`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'non_native_partition_engine',
    type: 'schema',
    category: 'invalidObjects',
    pattern: new RegExp(
      `PARTITION\\s+BY[^;]*ENGINE\\s*=\\s*(${NON_NATIVE_PARTITION_ENGINES.map(escapeRegex).join('|')})`,
      'gi'
    ),
    severity: 'warning',
    title: '비네이티브 파티셔닝 엔진',
    description: `${NON_NATIVE_PARTITION_ENGINES.join(', ')} 엔진의 파티셔닝은 deprecated되었습니다.`,
    suggestion: 'InnoDB 엔진으로 변경한 후 파티셔닝을 사용하세요.',
    mysqlShellCheckId: 'nonNativePartitioning',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations.html',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return [
          `-- 파티션 테이블을 InnoDB로 변경:`,
          `ALTER TABLE \`${tableMatch[1]}\` ENGINE=InnoDB;`
        ].join('\n');
      }
      return null;
    }
  }
];
