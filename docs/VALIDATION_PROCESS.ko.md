# 검증 프로세스 문서

> **버전**: 1.0
> **최종 업데이트**: 2026-01-28
> **관련 문서**: [README.ko.md](../README.ko.md) | [English Version](./VALIDATION_PROCESS.md)

MySQL Upgrade Compatibility Checker의 검증 프로세스에 대한 상세 문서입니다.

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [2-Pass 분석 프로세스](#2-2-pass-분석-프로세스)
3. [교차 검증 패턴](#3-교차-검증-패턴)
4. [규칙 기반 패턴 매칭](#4-규칙-기반-패턴-매칭)
5. [파일 유형별 처리](#5-파일-유형별-처리)
6. [이슈 생성](#6-이슈-생성)

---

## 1. 아키텍처 개요

### 상위 레벨 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           파일 선택                                      │
│                    (폴더 선택 / 드래그 앤 드롭)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FileAnalyzer.analyzeFiles()                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Pass 1: 메타데이터 수집                                           │  │
│  │  - 테이블 스키마 파싱 (컬럼, 인덱스, charset, 파티션)              │  │
│  │  - FULLTEXT 인덱스 수집                                           │  │
│  │  - ZEROFILL 컬럼 매핑                                             │  │
│  │  - ENUM 정의 추출                                                  │  │
│  │  - 외래키 참조 수집                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Pass 2: 전체 분석                                                 │  │
│  │  - 규칙 패턴 매칭 (67개 규칙)                                      │  │
│  │  - 파일 간 교차 검증                                               │  │
│  │  - 데이터 무결성 검사                                              │  │
│  │  - 스키마 기반 INSERT 데이터 검증                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Pass 2.5: 분석 후 검증                                            │  │
│  │  - FK 참조 인덱스 검증                                             │  │
│  │  - 고아 객체 감지                                                  │  │
│  │  - FTS 테이블 접두사 컨텍스트 검증                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           이슈 생성                                      │
│                (심각도: ERROR / WARNING / INFO)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    UIManager.displayResults()                           │
│                리포트 내보내기 (JSON/CSV/MySQL Shell)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 핵심 컴포넌트

| 컴포넌트 | 파일 | 목적 |
|----------|------|------|
| `FileAnalyzer` | `analyzer.ts` | 메인 분석 엔진, 2-pass 분석 조율 |
| `TableParser` | `parsers/table-parser.ts` | CREATE TABLE 문을 구조화된 데이터로 파싱 |
| `UserParser` | `parsers/user-parser.ts` | CREATE USER 및 GRANT 문 파싱 |
| `CompatibilityRules` | `rules/*.ts` | 카테고리별로 구성된 67개 규칙 |
| `Constants` | `constants.ts` | MySQL 8.4 호환성 참조 데이터 |

---

## 2. 2-Pass 분석 프로세스

### 왜 2-Pass인가?

단일 패스 분석으로는 파일 간 의존성을 검증할 수 없습니다. 예를 들어:
- `orders.sql`의 외래키가 `users.id`를 참조 - `users.id`에 PRIMARY KEY가 있는지 확인 필요
- `data.sql`의 INSERT 데이터에 4바이트 UTF-8 문자 포함 가능 - 테이블의 charset을 먼저 알아야 함

### Pass 1: 메타데이터 수집

Pass 1에서는 이슈를 생성하지 않고 구조적 정보만 수집합니다.

```typescript
// 수집되는 메타데이터 구조
private tableInfoMap: Map<string, TableInfo>;        // 테이블 스키마
private tableIndexMap: Map<string, TableIndexInfo>;  // 인덱스 정보
private tablesWithFulltextIndex: Set<string>;        // FULLTEXT가 있는 테이블
private zerofillColumns: Map<string, ZerofillColumnInfo>; // ZEROFILL 컬럼
private enumDefinitions: Map<string, string[]>;      // 컬럼별 ENUM 값
```

#### Pass 1에서 수집하는 내용

| 데이터 | 소스 | 용도 |
|--------|------|------|
| 테이블 charset/collation | `CREATE TABLE ... CHARSET=` | 4바이트 UTF-8 검증 |
| 컬럼 정의 | CREATE TABLE의 컬럼 목록 | ZEROFILL, ENUM 추출 |
| 인덱스 정보 | PRIMARY KEY, UNIQUE, KEY | FK 참조 검증 |
| 파티션 정의 | `PARTITION BY ...` | 비네이티브 파티션 검사 |
| FULLTEXT 인덱스 | `FULLTEXT KEY/INDEX` | FTS 접두사 검증 |
| 외래키 정의 | `CONSTRAINT ... FOREIGN KEY` | FK 이름 길이, 참조 검사 |

### Pass 2: 전체 분석

Pass 2에서는 수집된 메타데이터를 사용하여 실제 검증을 수행합니다.

```typescript
async analyzeFiles(files: File[]): Promise<AnalysisResults> {
  // Pass 1: 메타데이터 수집
  for (const file of sqlFiles) {
    await this.collectTableMetadata(file);
  }

  // Pass 2: 교차 검증을 포함한 전체 분석
  for (const file of allFiles) {
    await this.analyzeFile(file);  // 수집된 메타데이터 사용
  }

  // Pass 2.5: 분석 후 검증
  this.validateForeignKeyReferences();
  this.validateOrphanedObjects();
  this.validateFTSTablePrefixes();

  return this.results;
}
```

### Pass 2.5: 분석 후 검증

모든 파일이 분석된 후, 완전한 메타데이터가 필요한 추가 검증 수행:

1. **FK 참조 검증**: 참조되는 컬럼에 적절한 인덱스가 있는지 확인
2. **고아 객체**: 존재하지 않는 테이블을 참조하는 VIEW 감지
3. **FTS 접두사**: `FTS_` 접두사가 있는 테이블을 FULLTEXT 인덱스 존재 여부와 대조 검증

---

## 3. 교차 검증 패턴

분석기는 여러 소스의 컨텍스트가 필요한 13개의 교차 검증 패턴을 구현합니다.

### 3.1 UTF-8 + 4바이트 문자 검증

**목적**: utf8mb3를 사용하는 테이블에서 4바이트 UTF-8 문자(이모지 등) 감지

**프로세스**:
```
Pass 1: 테이블 charset 수집 → tableInfoMap
Pass 2: INSERT 파싱 → charset이 utf8/utf8mb3인지 확인 → 4바이트 문자 스캔
```

**감지 로직**:
```typescript
// 4바이트 UTF-8 감지 정규식
const fourByteUtf8Pattern = /[\u{10000}-\u{10FFFF}]/u;

// 테이블이 utf8mb3를 사용하는 경우에만 플래그
if (tableInfo.charset === 'utf8' || tableInfo.charset === 'utf8mb3') {
  if (fourByteUtf8Pattern.test(insertValue)) {
    // 이슈: utf8mb3 테이블에 4바이트 문자
  }
}
```

### 3.2 인덱스 크기 계산

**목적**: charset에 따라 3072바이트 제한을 초과하는 인덱스 감지

**프로세스**:
```
Pass 1: charset과 함께 컬럼 정의 수집
Pass 2: 인덱스 크기 계산 = 컬럼_길이 × 문자당_바이트
```

**바이트 계수**:
| Charset | 문자당 바이트 |
|---------|---------------|
| utf8mb4 | 4 |
| utf8mb3/utf8 | 3 |
| latin1 | 1 |
| binary | 1 |
| 기타 | 4 (보수적) |

### 3.3 비네이티브 파티셔닝 감지

**목적**: 네이티브 InnoDB 파티셔닝을 사용하지 않는 파티션 테이블 감지

**프로세스**:
```
Pass 1: 엔진 정보와 함께 파티션 정의 파싱
Pass 2: 파티션이 비-InnoDB 엔진을 사용하는지 확인
```

**감지 예시**:
```sql
-- 이것이 플래그됨
CREATE TABLE sales (
  id INT,
  sale_date DATE
) ENGINE=MyISAM
PARTITION BY RANGE (YEAR(sale_date)) (
  PARTITION p2023 VALUES LESS THAN (2024),
  PARTITION p2024 VALUES LESS THAN (2025)
);
```

### 3.4 생성 컬럼 함수 감지

**목적**: 8.4에서 deprecated되거나 변경된 함수를 사용하는 생성 컬럼 감지

**프로세스**:
```
Pass 1: 생성 컬럼 표현식 추출
Pass 2: deprecated 함수 패턴과 매칭
```

**모니터링 함수**:
- `PASSWORD()` - 제거됨
- `ENCRYPT()` - 제거됨
- `DES_ENCRYPT()` / `DES_DECRYPT()` - 제거됨
- 8.4에서 동작이 변경된 함수들

### 3.5 예약어 충돌 감지

**목적**: MySQL 8.4 예약어를 사용하는 식별자 감지

**8.4에서 추가된 키워드**:
```typescript
const NEW_RESERVED_KEYWORDS_84 = [
  'MANUAL', 'PARALLEL', 'QUALIFY', 'TABLESAMPLE'
];
```

**감지 범위**:
- 테이블 이름
- 컬럼 이름
- 인덱스 이름
- 저장 프로시저/함수 이름

### 3.6 FK 제약조건 이름 길이 검사

**목적**: 64자를 초과하는 외래키 이름 감지

**프로세스**:
```
Pass 1: FK 제약조건 이름 추출
Pass 2: 길이 > 64자 검사
```

**예시**:
```sql
-- 이것이 플래그됨 (이름 > 64자)
ALTER TABLE orders ADD CONSTRAINT
  fk_orders_customers_customer_id_references_customers_customer_id_primary_key
  FOREIGN KEY (customer_id) REFERENCES customers(id);
```

### 3.7 고아 객체 감지

**목적**: 덤프에 존재하지 않는 테이블을 참조하는 VIEW 감지

**프로세스**:
```
Pass 1: 모든 테이블 이름 수집
Pass 2.5: VIEW 정의 파싱 → 참조된 테이블 존재 여부 확인
```

**제한사항**:
- 다른 스키마의 테이블 참조는 감지 불가
- 복잡한 서브쿼리 검증 불가

### 3.8 Latin1 + 비ASCII 데이터 검증

**목적**: 인코딩 문제가 있을 수 있는 latin1 테이블의 비ASCII 데이터 감지

**프로세스**:
```
Pass 1: latin1 charset을 가진 테이블 수집
Pass 2: INSERT 데이터에서 비ASCII 문자 (> 0x7F) 스캔
```

### 3.9 ENUM 빈 값 + 정의 검증

**목적**: ENUM 컬럼의 빈 문자열 값 감지

**프로세스**:
```
Pass 1: 컬럼별 ENUM 정의 추출
Pass 2: ENUM 컬럼에 대한 빈 문자열 ('') INSERT 감지
```

**감지**:
```typescript
// 컬럼 정의에서 빈 ENUM 감지
const emptyEnumPattern = /[,\(]\s*['"]['"]/i;  // ('', ...) 또는 (..., '') 매칭

// INSERT에서 빈 값 감지
if (enumValues.includes('') || insertValue === '') {
  // 이슈: 빈 ENUM 값
}
```

### 3.10 공유 테이블스페이스 파티션 검사

**목적**: 공유(비-file-per-table) 테이블스페이스에 있는 파티션 테이블 감지

**프로세스**:
```
Pass 1: 테이블 및 파티션 레벨에서 TABLESPACE 절 파싱
Pass 2: 공유 테이블스페이스의 파티션 플래그
```

**예시**:
```sql
-- 이것이 플래그됨
CREATE TABLE orders (...)
PARTITION BY HASH(id) PARTITIONS 4
TABLESPACE shared_ts;  -- 공유 테이블스페이스
```

### 3.11 FTS 테이블 접두사 컨텍스트 검증

**목적**: InnoDB 내부 FTS 테이블이 아닌 `FTS_` 접두사를 가진 테이블 감지

**프로세스**:
```
Pass 1: FULLTEXT 인덱스가 있는 테이블 수집
Pass 2.5: 'FTS_'로 시작하는 테이블 확인
        → InnoDB 내부 패턴이 아니면 잠재적 충돌로 플래그
```

**InnoDB 내부 FTS 패턴**:
```typescript
// InnoDB 내부 FTS 테이블은 이 패턴을 따름
const internalFtsPattern = /^FTS_[0-9A-Fa-f]{16}_/i;
// 예: FTS_0000000000000001_DELETED
```

### 3.12 ZEROFILL 데이터 의존성 검사

**목적**: ZEROFILL 패딩에 의존하는 INSERT 데이터 감지

**프로세스**:
```
Pass 1: 표시 너비와 함께 ZEROFILL 컬럼 수집
Pass 2: INSERT 값 파싱 → 길이 < 표시 너비인지 확인
```

**예시**:
```sql
CREATE TABLE products (
  code INT(5) ZEROFILL  -- 표시 너비: 5
);

INSERT INTO products (code) VALUES (42);
-- 값 '42'는 길이 2, '00042'로 표시됨
-- ZEROFILL이 deprecated되었으므로 플래그됨
```

### 3.13 인증 플러그인 상수 활용

**목적**: 중앙화된 상수를 사용한 포괄적인 인증 플러그인 상태 검사

**상수 구조**:
```typescript
const AUTH_PLUGINS = {
  disabled: ['mysql_native_password'],           // 8.4에서 기본 비활성화
  removed: ['authentication_fido'],              // 완전히 제거됨
  deprecated: ['sha256_password'],               // Deprecated
  recommended: 'caching_sha2_password'           // 권장 대안
};
```

---

## 4. 규칙 기반 패턴 매칭

### 규칙 구조

각 규칙은 `CompatibilityRule` 인터페이스를 따릅니다:

```typescript
interface CompatibilityRule {
  id: string;                    // 고유 식별자
  type: RuleType;                // schema | data | config | privilege | query
  category: RuleCategory;        // 그룹 카테고리
  pattern?: RegExp;              // 감지용 정규식
  detectInData?: Function;       // 커스텀 데이터 감지
  detectInConfig?: Function;     // 커스텀 설정 감지
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  suggestion: string;
  mysqlShellCheckId?: string;    // 동등한 MySQL Shell 검사
  docLink?: string;              // 문서 URL
  generateFixQuery?: Function;   // 자동 수정 SQL 생성기
}
```

### 규칙 카테고리

| 카테고리 | 개수 | 예시 |
|----------|------|------|
| `removedSysVars` | 48 | default_authentication_plugin, expire_logs_days |
| `newDefaultVars` | 5 | replica_parallel_workers, innodb_adaptive_hash_index |
| `authentication` | 9 | mysql_native_password, sha256_password |
| `reservedKeywords` | 6 | MANUAL, PARALLEL, QUALIFY, TABLESAMPLE |
| `invalidPrivileges` | 3 | SUPER 권한, 제거된 grants |
| `invalidObjects` | 15 | utf8mb3, ZEROFILL, deprecated 엔진 |
| `dataIntegrity` | 8 | 제로 날짜, 빈 ENUM, NULL 바이트 |

### 패턴 매칭 프로세스

```typescript
for (const rule of compatibilityRules) {
  if (rule.pattern) {
    const matches = content.matchAll(rule.pattern);
    for (const match of matches) {
      this.addIssue({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        // ... 추가 컨텍스트
      });
    }
  }
}
```

---

## 5. 파일 유형별 처리

### 지원 파일 유형

| 확장자 | 프로세서 | 수행 검사 |
|--------|----------|----------|
| `.sql` | `analyzeSQLFile()` | 스키마, 데이터, grants, 쿼리 |
| `.cnf`, `.ini` | `analyzeConfigFile()` | 시스템 변수 |
| `.tsv`, `.txt` | `analyzeTSVData()` | 4바이트 UTF-8, 데이터 무결성 |
| `@.json` | `analyzeMysqlShellMetadata()` | Charset, 버전 정보 |

### SQL 파일 처리

```typescript
async analyzeSQLFile(content: string, fileName: string) {
  // 1. CREATE TABLE 문
  const createTableMatches = content.matchAll(/CREATE\s+TABLE[^;]+;/gi);
  for (const match of createTableMatches) {
    const tableInfo = TableParser.parse(match[0]);
    this.validateTable(tableInfo, fileName);
  }

  // 2. INSERT 문 (스키마 컨텍스트와 함께)
  const insertMatches = content.matchAll(/INSERT\s+INTO[^;]+;/gi);
  for (const match of insertMatches) {
    this.validateInsertData(match[0], fileName);
  }

  // 3. CREATE USER / GRANT 문
  this.validateUserStatements(content, fileName);

  // 4. 패턴 기반 규칙 매칭
  this.applyRules(content, fileName);
}
```

### 설정 파일 처리

```typescript
analyzeConfigFile(content: string, fileName: string) {
  // INI 형식 파싱
  const lines = content.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (line.match(/^\[(.+)\]$/)) {
      currentSection = RegExp.$1;
    } else if (line.includes('=')) {
      const [key, value] = line.split('=');
      this.validateConfigVariable(key.trim(), value.trim(), fileName);
    }
  }
}
```

---

## 6. 이슈 생성

### 이슈 구조

```typescript
interface Issue {
  id: string;              // 이 이슈를 생성한 규칙 ID
  severity: Severity;      // error | warning | info
  title: string;           // 사람이 읽을 수 있는 제목
  description: string;     // 상세 설명
  fileName: string;        // 소스 파일
  lineNumber?: number;     // 소스 파일의 라인
  code?: string;           // 관련 코드 스니펫
  suggestion: string;      // 수정 방법
  fixQuery?: string;       // 자동 생성된 수정 SQL
  docLink?: string;        // 문서 URL
}
```

### 심각도 레벨

| 레벨 | 의미 | 필요 조치 |
|------|------|----------|
| **ERROR** | 호환성 파괴 변경 | 업그레이드 전 반드시 수정 |
| **WARNING** | Deprecated/위험 | 수정 권장, 문제 발생 가능 |
| **INFO** | 정보성 | 선택적 개선 |

### 수정 쿼리 생성

많은 규칙에 자동 수정 쿼리 생성이 포함됩니다:

```typescript
{
  id: 'mysql_native_password',
  // ...
  generateFixQuery: (context) => {
    if (context.userName) {
      return `ALTER USER '${context.userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'new_password';`;
    }
    return null;
  }
}
```

---

## 부록: 검증 흐름 다이어그램

### INSERT 데이터 검증 흐름

```
INSERT INTO users (id, name, emoji) VALUES (1, 'John', '😀');
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 1. 테이블 이름 추출: 'users'             │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 2. tableInfoMap['users'] 조회           │
│    → charset: 'utf8mb3'                 │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 3. 컬럼 값 파싱                          │
│    → emoji 컬럼: '😀'                   │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 4. 검사: '😀'가 4바이트 UTF-8인가?       │
│    → 예 (U+1F600)                       │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 5. charset == 'utf8mb3'?                │
│    → 예 → WARNING 생성                  │
└─────────────────────────────────────────┘
```

### FK 참조 검증 흐름

```
CONSTRAINT `fk_order_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 1. 대기 중인 FK 검사 저장:               │
│    - 테이블: orders                     │
│    - 참조 테이블: users                  │
│    - 참조 컬럼: id                       │
└─────────────────────────────────────────┘
                      │
        (모든 파일 처리 후)
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 2. tableIndexMap['users'] 조회          │
│    → primaryKey: ['id']                 │
│    → uniqueIndexes: [...]               │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 3. 검사: 'id'에 PK 또는 UNIQUE가 있는가? │
│    → 예 → 이슈 없음                     │
│    → 아니오 → WARNING 생성              │
└─────────────────────────────────────────┘
```

---

## 관련 문서

- [README.ko.md](../README.ko.md) - 프로젝트 개요 및 사용법
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 기여 가이드라인
- [constants.ts](../src/scripts/constants.ts) - MySQL 8.4 호환성 데이터

---

*최종 업데이트: 2026-01-28*
